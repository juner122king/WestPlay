//! The player's maps for the cab, discovered from each game's profiles and served from WestPlay's
//! `maps` folder. Discovery stays lightweight for unselected targets. Automatic preparation requires
//! both the game and profile switches; explicit requests prepare only their selected targets.
//!
//! Profiles with the same game, map and active mount stack share a task and its result. Existing caches
//! remain usable while stale or unverified. Legacy caches need one explicit preparation to establish
//! the dependency baseline; version and package metadata changes then trigger validation, not a rebuild.
//!
//! Full generation waits for the game to close and for sufficient free memory ([`MEMORY_NEEDED`]),
//! with the recently played profile first. HVT's Road to Heavy is never built. TruckersMP's ordinary
//! and ProMods maps are separate opt-in targets under each game.
//!
//! Requests and persisted cancellation are managed by [`Control`]. A task records the effective inputs
//! observed by the generator, and publishes its dependencies with the manifest after new resources
//! have been written. Cancelling a task keeps the previous cache and does not stop this watcher.

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::mpsc::{self, Receiver, Sender};
use std::sync::{Arc, Condvar, Mutex};
use std::time::{Duration, SystemTime};

use westplay_mapdata::export::{Progress, Stage};
use westplay_mapdata::{locale, save};
use westplay_setup::game::{Game, Kind};
use westplay_setup::{map, map_builder, places, profiles, truckersmp};

use crate::map_process;
use crate::map_tasks::Control;
use crate::settings::SharedSettings;

/// The packs the last TruckersMP session in the game `kind` mounted, kept in the `maps` folder (truckersmp.rs):
/// ETS2's as before ATS, ATS's beside it; a ProMods server's session's apart (`promods`), so each of the two maps
/// stays as it was while the player goes from one kind of server to the other.
fn truckersmp_record(kind: Kind, promods: bool) -> &'static str {
    match (kind, promods) {
        (Kind::Ets2, false) => "truckersmp.json",
        (Kind::Ats, false) => "truckersmp-ats.json",
        (Kind::Ets2, true) => "truckersmp-promods.json",
        (Kind::Ats, true) => "truckersmp-ats-promods.json",
    }
}

/// How often to look again: the profile played, the game running or not.
const CHECK_EVERY: Duration = Duration::from_secs(10);
/// How often the profile's map mods are looked at again anyway (a Workshop mod updated changes no profile).
const RECHECK_MODS: Duration = Duration::from_secs(5 * 60);

/// The memory a build wants free, bytes: the base game's whole map peaked at 2.93 GB (2026-10-17, measured
/// as it was built), and a margin for the rest of the PC.
pub const MEMORY_NEEDED: u64 = 3_500_000_000;

// No build is stopped for the memory it takes (owner 2026-11-06: the biggest map mods need more than any share of a
// PC WestPlay would set; Windows lends a build the disk). Prepare Maps Faster fills four fifths of it with blocks
// drawn at once, and no more (westplay_mapdata::threads::room_on).

/// The map's state, for the companion window.
#[derive(Clone, Debug, Default, PartialEq, serde::Serialize)]
#[serde(tag = "state", rename_all = "camelCase")]
pub enum MapStatus {
    /// Not looked yet.
    #[default]
    Unknown,
    /// WestPlay isn't set up in a game yet, or the game isn't there any more.
    NoGame,
    Ready,
    NotPrepared,
    Unverified,
    Stale,
    Checking,
    Cancelled,
    /// Being built: how far, 0 to 1.
    Building {
        done: f32,
        /// What it's doing now.
        stage: MapStage,
    },
    /// To build, once the game is closed.
    WaitingForGame,
    /// To build, once the PC has `needed` bytes of memory free (it has `free` now).
    WaitingForMemory {
        needed: u64,
        free: u64,
    },
    /// A map WestPlay doesn't allow.
    NotAllowed,
    Failed {
        error: String,
    },
    /// Another profile's map, to build after the maps before it.
    Queued,
}

/// A profile's map, for the companion's list of profiles: the profile (its folder, as the setup's check of
/// the game names it), its map's state, and the map mods left out of it (their files couldn't be read).
#[derive(Clone, Debug, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileMap {
    /// Its game: `ets2` or `ats`.
    pub game: Kind,
    pub dir: String,
    /// Its map's folder, by name: profiles sharing a map share it (what [`SetUpGame::prepare_maps`] asks by).
    pub folder: String,
    pub status: MapStatus,
    pub target: String,
    pub name: String,
    pub auto_enabled: bool,
    pub game_auto_enabled: bool,
    pub has_cache: bool,
    pub cache_state: String,
    pub task_id: Option<String>,
    pub reason: Option<String>,
    pub shared_targets: Vec<String>,
    /// The map it plays (`europe`, or a standalone map mod's) and the mods that change it as the game names them,
    /// with how many of those can't be read: as worked out from its profile at this look, so the companion's rows
    /// say what the profile plays now (owner 2026-11-07: Grand Utopia turned off in the game and saved, the Map page
    /// still named it, from setup's check of the game made before). HVT's map, and HVT's mods: none named.
    pub map: String,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub map_mods: Vec<String>,
    #[serde(skip_serializing_if = "is_zero")]
    pub unreadable: usize,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub left_out: Vec<String>,
    /// TruckersMP's map (its `dir` TruckersMP's installation), not a profile's.
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub truckersmp: bool,
    /// TruckersMP's ProMods servers' map, beside its other servers'.
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub promods: bool,
}

/// What a map being built is doing, for the companion to tell the player.
#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub enum MapStage {
    /// The map's sectors and definitions, from the game, its DLCs and the map mods.
    Reading,
    /// Roads, junctions, water and land, drawn as shapes.
    Drawing,
    /// The shapes cut into tiles.
    Tiles,
    /// The rest written (the road signs, the places, the map's manifest).
    Saving,
}

impl MapStage {
    fn of(progress: &Progress) -> Self {
        match progress.stage {
            Stage::Reading => Self::Reading,
            Stage::Drawing => Self::Drawing,
            // The tiles are written by 0.95 of the way.
            Stage::Tiles if progress.done < 0.95 => Self::Tiles,
            Stage::Tiles | Stage::Done => Self::Saving,
        }
    }
}

/// What the cab shows and the companion says.
#[derive(Clone, Debug, PartialEq)]
pub struct MapUpdate {
    /// The map's folder in the `maps` folder, for the cab (`None`: no map to show).
    pub folder: Option<String>,
    /// When the map shown was built (seconds since 1970): a map built again keeps its folder.
    pub built: Option<u64>,
    /// The played profile's map's state.
    pub status: MapStatus,
    /// Every profile's map's state.
    pub profiles: Vec<ProfileMap>,
}

/// The games WestPlay is set up in (their folders: one a game, ETS2's and ATS's), set by the companion's setup, and
/// the player's asks to prepare the maps again (the companion's Map page), from any thread: the watch looks at once
/// at either.
#[derive(Debug, Default)]
pub struct SetUpGame {
    control: Arc<Control>,
    state: Mutex<SetUp>,
    changed: Condvar,
}

#[derive(Clone, Debug, Default, PartialEq)]
struct SetUp {
    dirs: Vec<PathBuf>,
    /// How many times the player has asked to prepare the maps again.
    asked_again: u64,
}

impl SetUpGame {
    pub fn new(dirs: Vec<PathBuf>) -> Self {
        Self {
            state: Mutex::new(SetUp { dirs, asked_again: 0 }),
            changed: Condvar::new(),
            control: Arc::new(Control::default()),
        }
    }

    fn state(&self) -> std::sync::MutexGuard<'_, SetUp> {
        self.state.lock().unwrap_or_else(|e| e.into_inner())
    }

    pub fn set(&self, dirs: Vec<PathBuf>) {
        self.state().dirs = dirs;
        self.changed.notify_all();
    }

    pub fn get(&self) -> Vec<PathBuf> {
        self.state().dirs.clone()
    }

    /// Explicit, stable profile targets; there is no implicit "all games" request.
    pub fn prepare_maps(&self, targets: Vec<String>, force: bool) -> Result<(), String> {
        self.control.request(targets, force)?;
        self.state().asked_again += 1;
        self.wake();
        Ok(())
    }
    pub fn cancel_map_preparation(&self, task_id: &str) -> Result<bool, String> {
        let result = self.control.cancel(task_id);
        self.state().asked_again += 1;
        self.wake();
        result
    }

    /// Waits up to `timeout` for the game, or the player's asks, to be other than `known`, or for `builds` to stop.
    fn wait_for_another(&self, known: &SetUp, timeout: Duration, builds: &map_process::Builds) {
        let state = self.state();
        let _ = self.changed.wait_timeout_while(state, timeout, |state| state == known && !builds.stopped());
    }

    /// Wakes the watches waiting ([`Self::wait_for_another`]): one of them is to stop.
    fn wake(&self) {
        let _state = self.state();
        self.changed.notify_all();
    }
}

pub struct MapWatch {
    pub updates: Receiver<MapUpdate>,
    /// The map the played profile plays, as worked out.
    pub played: PlayedMap,
    /// The watch's builds, stopped with it, its thread waited for ([`Drop`]).
    builds: Arc<map_process::Builds>,
    game: Arc<SetUpGame>,
    thread: Option<std::thread::JoinHandle<()>>,
    /// Whether its maps are built by the map builder (stopped at once), or in WestPlay's own process.
    by_builder: bool,
}

/// The watch ends with its handle (the host's run ending: WestPlay stopping, or the host started again): a map
/// builder running is ended, and the next run's watch starts once this one is gone, never building beside it
/// (`worker`: a player's map built twice at once into one folder, 2026-11-07). A build in WestPlay's own process
/// (no builder) can't be ended: not waited for, it ends the watch when it's done.
impl Drop for MapWatch {
    fn drop(&mut self) {
        self.builds.stop();
        self.game.wake();
        if let Some(thread) = self.thread.take()
            && self.by_builder
        {
            let _ = thread.join();
        }
    }
}

/// The game played and its profile played (its map and its map mods): what the cab's map is built from, and so
/// what the route's junctions are read from (route.rs). `None` until worked out, and without a game.
pub type PlayedMap = Arc<Mutex<Option<(Game, profiles::Profile)>>>;

impl MapWatch {
    /// Watches the maps of the profiles in the games set up (`game`), building each into `maps` when it needs it
    /// and the games are closed.
    /// How hard each build works is read from `settings` as it starts (`MapSettings::fast`); each is built by the
    /// map builder `builder` (`map_process`), or in WestPlay's own process without one.
    pub fn start(maps: PathBuf, game: Arc<SetUpGame>, settings: Arc<SharedSettings>, builder: Option<PathBuf>) -> Self {
        game.control.load(&maps);
        let (sender, updates) = mpsc::channel();
        let played = PlayedMap::default();
        let telling = played.clone();
        let builds = Arc::new(map_process::Builds::default());
        let (watching, by_builder) = (builds.clone(), builder.is_some());
        let set_up = game.clone();
        let thread = std::thread::Builder::new()
            .name("westplay-maps".into())
            .spawn(move || watch(&maps, &set_up, &settings, builder.as_deref(), &sender, &telling, &watching))
            .ok();
        Self { updates, played, builds, game, thread, by_builder }
    }
}

/// TruckersMP's installation, and its packs with when each was written.
type TruckersMpPacks = (PathBuf, Vec<(PathBuf, Option<SystemTime>)>);

/// What the profiles' maps were worked out from: when none of it changes, the maps stay what they were.
#[derive(Clone, Debug, PartialEq)]
struct Basis {
    selection: u64,
    /// The game's folder (WestPlay set up in another).
    game: PathBuf,
    /// The profile the game has selected, by name (its log), and the folder of the one with the newest save.
    selected: Option<String>,
    profile: Option<PathBuf>,
    /// Every profile, and when its `profile.sii` (its mods) was last written.
    profiles: Vec<(PathBuf, Option<SystemTime>)>,
    game_written: Option<SystemTime>,
    /// TruckersMP's installation, if it's installed, with its packs and when each was written (its launcher
    /// updates them), and the packs the game's last session mounted from it (its log; `None`: it wasn't
    /// TruckersMP's).
    truckersmp: Option<TruckersMpPacks>,
    session: Option<Vec<PathBuf>>,
    /// Which stretch of `RECHECK_MODS` it is.
    round: u64,
}

/// Maps that couldn't be made, by folder: what each was built from then, and why. Tried again once what it's
/// built from changes, not every few seconds.
type Failures = HashMap<PathBuf, (serde_json::Value, String)>;

fn watch(
    maps: &Path,
    set_up: &SetUpGame,
    settings: &SharedSettings,
    builder: Option<&Path>,
    sender: &Sender<MapUpdate>,
    played: &PlayedMap,
    builds: &map_process::Builds,
) {
    let userdata = places::steam().map(|steam| steam.join("userdata"));
    // Each set-up game's own folder in Documents, looked for once a game.
    let mut documents_of: HashMap<Kind, Option<PathBuf>> = HashMap::new();
    let mut sent: Option<MapUpdate> = None;
    // Each game's maps as last worked out (by the game's folder), and from what.
    let mut worked_out: HashMap<PathBuf, (Basis, Vec<Want>)> = HashMap::new();
    // A game's maps that couldn't be worked out (a panic), from what, and why.
    let mut wants_failed: HashMap<PathBuf, (Basis, String)> = HashMap::new();
    let mut failed = Failures::new();
    let mut verified: HashMap<PathBuf, (String, map::CacheCheck)> = HashMap::new();
    // The last explicit request/cancellation seen, to refresh lightweight discovery immediately.
    let mut asked_again = 0;
    // Unused maps not removed whole yet, told once (tried again at each look).
    let mut not_removed: HashSet<PathBuf> = HashSet::new();
    while !builds.stopped() {
        let set_up_in = set_up.state().clone();
        let games: Vec<(Game, PathBuf)> = set_up_in
            .dirs
            .iter()
            .filter_map(|dir| Game::recognise(dir))
            .filter_map(|game| {
                let documents = documents_of.entry(game.kind).or_insert_with(|| places::game_documents(game.kind));
                let documents = documents.clone()?;
                Some((game, documents))
            })
            .collect();
        let games = played_first(games, userdata.as_deref());
        let asked_now = set_up_in.asked_again != asked_again;
        if asked_now {
            asked_again = set_up_in.asked_again;
            // Everything looked at afresh; the maps asked for, their failures forgotten.
            worked_out.clear();
            wants_failed.clear();
        }
        // Every game's maps in one list, the played game's first (its played profile's map the one the cab shows);
        // whether each game's were worked out, and why the played game's couldn't be.
        let mut wants: Vec<Want> = Vec::new();
        let mut all_worked_out = true;
        let mut played_failed: Option<String> = None;
        for (index, (game, documents)) in games.iter().enumerate() {
            let mut basis = basis(game, documents, userdata.as_deref());
            basis.selection = settings.generation().wrapping_add(set_up.control.generation().rotate_left(32));
            // A TruckersMP session's packs, kept for its map until the next session: once the game has closed, its
            // log whole. While it starts, the log has only the packs mounted so far (23 of 24), which made another
            // map of TruckersMP's, the one it had removed, and the whole one built again at every quit (owner
            // 2026-11-03).
            if let Some(session) = &basis.session
                && !game.kind.running()
            {
                let promods = truckersmp::promods(session);
                if truckersmp::remember(&maps.join(truckersmp_record(game.kind, promods)), session) {
                    let server = if promods { "a ProMods server" } else { "a server without ProMods" };
                    log!("TruckersMP: its last session ({server}) mounted {} packs", session.len());
                }
            }
            match work_out(
                game,
                documents,
                userdata.as_deref(),
                basis,
                maps,
                settings,
                &set_up.control,
                &mut worked_out,
                &mut wants_failed,
            ) {
                Ok(game_wants) => wants.extend(game_wants),
                // A game whose maps couldn't be worked out leaves the others' to be made (owner 2026-10-18: one
                // profile's map failing must not stop the others').
                Err(error) => {
                    all_worked_out = false;
                    if index == 0 {
                        played_failed = Some(error);
                    }
                }
            }
        }
        // Those of games set up no more (or gone) forgotten.
        worked_out.retain(|dir, _| games.iter().any(|(game, _)| &game.dir == dir));
        wants_failed.retain(|dir, _| games.iter().any(|(game, _)| &game.dir == dir));
        let (update, more) = if games.is_empty() {
            *played.lock().unwrap_or_else(|e| e.into_inner()) = None;
            let update = MapUpdate { folder: None, built: None, status: MapStatus::NoGame, profiles: Vec::new() };
            (update, false)
        } else if let Some(error) = played_failed {
            // The played game's failed: said so (the Companion's map step and its Prepare Maps Again have a state
            // to show), the cab keeping the map it has.
            let (folder, built) = sent.as_ref().map_or((None, None), |sent| (sent.folder.clone(), sent.built));
            let status = MapStatus::Failed { error };
            (MapUpdate { folder, built, status, profiles: Vec::new() }, false)
        } else {
            let (game, profile) = (&wants[0].game, &wants[0].profile);
            let mut shared = played.lock().unwrap_or_else(|e| e.into_inner());
            if shared.as_ref().is_none_or(|(known_game, known)| known_game != game || known != profile) {
                *shared = Some((game.clone(), profile.clone()));
            }
            drop(shared);
            let fast = settings.get().map.fast;
            let (mut update, more) = carry_out(
                &wants,
                maps,
                fast,
                builder,
                &mut failed,
                sender,
                &mut sent,
                builds,
                settings,
                &set_up.control,
                &mut verified,
            );
            // A game running that WestPlay isn't set up in (ATS beside an ETS2 set up before it, its plugin put
            // there by hand): no map in its cab, never the other game's.
            if Kind::ALL.iter().any(|kind| kind.running() && !games.iter().any(|(game, _)| game.kind == *kind)) {
                update.folder = None;
                update.built = None;
            }
            (update, more)
        };
        set_up.control.known(wants.iter().flat_map(targets_of));
        if sent.as_ref() != Some(&update) {
            if sender.send(update.clone()).is_err() {
                return;
            }
            sent = Some(update);
        }
        // The maps no one wants any more gone (none is being built between two looks), once the maps' state is
        // told: a big map takes minutes to remove, and until the first state the companion has none to show
        // (its Prepare Maps Again hidden, 2.0). Only once every game's maps are known: another game's maps are
        // wanted too.
        if !games.is_empty() && all_worked_out {
            let mut keep = wants.clone();
            if let Some(template) = wants.first() {
                for folder in set_up.control.pinned() {
                    let mut pin = template.clone();
                    pin.folder = maps.join(folder);
                    keep.push(pin);
                }
            }
            remove_unused(maps, &keep, &mut not_removed);
        }
        // A map just built: on to the next at once.
        if !more {
            set_up.wait_for_another(&set_up_in, CHECK_EVERY, builds);
        }
    }
}

/// The games set up (each with its folder in Documents), the one played first: the one running, else the one
/// saved in last.
fn played_first(mut games: Vec<(Game, PathBuf)>, userdata: Option<&Path>) -> Vec<(Game, PathBuf)> {
    games.sort_by_cached_key(|(game, documents)| {
        let saved = save::latest(documents, userdata, game.kind.steam_app())
            .and_then(|save| std::fs::metadata(save).ok()?.modified().ok());
        (std::cmp::Reverse(game.kind.running()), std::cmp::Reverse(saved))
    });
    games
}

/// The maps `game`'s profiles want ([`wants`]): as last worked out while what they're worked out from (`basis`)
/// is the same, else worked out anew (kept in `worked_out`); why not, if that failed (a panic, kept in
/// `wants_failed`: not tried again until something of it changes).
#[allow(clippy::too_many_arguments)]
fn work_out(
    game: &Game,
    documents: &Path,
    userdata: Option<&Path>,
    basis: Basis,
    maps: &Path,
    settings: &SharedSettings,
    control: &Control,
    worked_out: &mut HashMap<PathBuf, (Basis, Vec<Want>)>,
    wants_failed: &mut HashMap<PathBuf, (Basis, String)>,
) -> Result<Vec<Want>, String> {
    if let Some((known, wants)) = worked_out.get(&game.dir)
        && *known == basis
    {
        return Ok(wants.clone());
    }
    if let Some((known, error)) = wants_failed.get(&game.dir)
        && *known == basis
    {
        return Err(error.clone());
    }
    // Worked out anew (each profile's map mods opened: a long list takes a while), timed in the log, so a look
    // that never ends shows where it stopped. A panic (a mod's archive read wrong, 2.0.3) is this look failing,
    // not the maps' watch stopping for good.
    let started = std::time::Instant::now();
    log!("maps: working out each profile's map");
    let worked = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        wants(game, documents, userdata, &basis, maps, settings, control)
    }));
    match worked {
        Ok(wants) => {
            log!(
                "maps: {} map(s) for the profiles, worked out in {:.1} s",
                wants.len(),
                started.elapsed().as_secs_f32()
            );
            wants_failed.remove(&game.dir);
            worked_out.insert(game.dir.clone(), (basis, wants.clone()));
            Ok(wants)
        }
        Err(panic) => {
            let error = format!("couldn't read the profiles' mods ({})", panic_message(&*panic));
            log!("maps: {error}");
            worked_out.remove(&game.dir);
            wants_failed.insert(game.dir.clone(), (basis, error.clone()));
            Err(error)
        }
    }
}

fn basis(game: &Game, documents: &Path, userdata: Option<&Path>) -> Basis {
    let profile = save::latest(documents, userdata, game.kind.steam_app())
        .and_then(|save| save::profile_of(&save)?.parent().map(Path::to_path_buf));
    let written = |path: &Path| std::fs::metadata(path).and_then(|m| m.modified()).ok();
    Basis {
        selection: 0,
        game: game.dir.clone(),
        selected: profiles::selected(documents),
        profile,
        profiles: profile_dirs(game.kind, documents, userdata)
            .into_iter()
            .map(|dir| {
                let at = written(&dir.join("profile.sii"));
                (dir, at)
            })
            .collect(),
        game_written: written(&game.dir.join(game.kind.executable())),
        truckersmp: truckersmp::installation().map(|installation| {
            let packs = truckersmp::packs(&installation, game.kind).into_iter().map(|pack| {
                let at = written(&pack);
                (pack, at)
            });
            (installation.clone(), packs.collect())
        }),
        session: std::fs::read(documents.join("game.log.txt"))
            .ok()
            .and_then(|log| truckersmp::mounted(&String::from_utf8_lossy(&log))),
        round: SystemTime::now().duration_since(SystemTime::UNIX_EPOCH).map_or(0, |d| d.as_secs())
            / RECHECK_MODS.as_secs(),
    }
}

/// Every profile's folder of the game `kind`, as `profiles::find` looks for them (its Documents folder's, and
/// Steam Cloud's under Steam's `userdata`), sorted.
fn profile_dirs(kind: Kind, documents: &Path, userdata: Option<&Path>) -> Vec<PathBuf> {
    let mut folders = vec![documents.join("profiles"), documents.join("steam_profiles")];
    for user in userdata.into_iter().flat_map(|dir| std::fs::read_dir(dir).into_iter().flatten().flatten()) {
        folders.push(user.path().join(kind.steam_app()).join("remote").join("profiles"));
    }
    let mut dirs: Vec<PathBuf> = folders
        .iter()
        .flat_map(|folder| std::fs::read_dir(folder).into_iter().flatten().flatten())
        .map(|entry| entry.path())
        .filter(|dir| dir.join("profile.sii").is_file())
        .collect();
    dirs.sort();
    dirs
}

/// A map some profiles want: its game, its folder, what it's built from, a profile to build it for, and every
/// profile that plays it.
#[derive(Clone)]
struct Want {
    resolved: bool,
    names: HashMap<PathBuf, String>,
    game: Game,
    profile: profiles::Profile,
    dirs: Vec<PathBuf>,
    folder: PathBuf,
    source: serde_json::Value,
    language: Option<String>,
    allowed: bool,
    /// TruckersMP's map, not a profile's.
    truckersmp: bool,
    /// TruckersMP's ProMods servers' map.
    promods: bool,
}

/// The maps the profiles want, the played profile's first (the profile last saved in; before any save, the
/// most recently made one; before any profile, the one a new player makes), then the others', the most
/// recently played first. Profiles playing the same map with the same map mods share one.
fn wants(
    game: &Game,
    documents: &Path,
    userdata: Option<&Path>,
    basis: &Basis,
    maps: &Path,
    settings: &SharedSettings,
    control: &Control,
) -> Vec<Want> {
    let maintenance = settings.get().map.maintenance;
    let resolve = |dir: &Path| {
        let target = map::target(game.kind, dir, false, false);
        maintenance.enabled(game.kind, &target) || control.requested(&target)
    };
    let mut all = profiles::find_with_resolution(game.kind, documents, userdata, Some(game), &resolve);
    // The profile played: the one the game has selected (its log; two of the same name, the one with the
    // newest save first), else the one with the newest save, else the newest.
    let named = basis.selected.as_ref().and_then(|name| {
        let mut same: Vec<usize> = (0..all.len()).filter(|&index| &all[index].name == name).collect();
        same.sort_by_key(|&index| basis.profile.as_ref() != Some(&all[index].dir));
        same.first().copied()
    });
    let played = match (named, &basis.profile) {
        (Some(index), _) => Some(index),
        (None, Some(dir)) => all.iter().position(|profile| &profile.dir == dir),
        (None, None) => (!all.is_empty()).then_some(0),
    };
    let first = match played {
        Some(index) => all.remove(index),
        None => {
            let mut profile = profiles::Profile::new_player(game.kind);
            profile.dir = documents.join("profiles");
            profile.name = game.kind.base_map().into();
            profile
        }
    };
    let language = std::fs::read_to_string(documents.join("config.cfg")).ok().and_then(|c| locale::game_language(&c));
    let mut wants: Vec<Want> = Vec::new();
    for profile in std::iter::once(first).chain(all) {
        let resolved = resolve(&profile.dir);
        // Package identities are available from profile.sii without opening archives.
        let folder = map::folder_for(maps, game, &profile);
        if let Some(want) = wants.iter_mut().find(|want| want.folder == folder) {
            want.names.insert(profile.dir.clone(), profile.name.clone());
            want.dirs.push(profile.dir.clone());
            if resolved && !want.resolved {
                want.source = map::source(game, &profile, language.as_deref());
                want.allowed = !profile.plays_hvt_map();
                // Borrow the resolved mount stack while keeping the played profile's identity.
                want.profile.mods = profile.mods;
                want.resolved = true;
            }
            continue;
        }
        let source = if resolved {
            map::source(game, &profile, language.as_deref())
        } else {
            serde_json::json!({
                "game": game.version.map(|version| version.to_string()),
                "map": profile.map,
                "profileWritten": map::profile_stamp(&profile.dir),
            })
        };
        wants.push(Want {
            resolved,
            dirs: vec![profile.dir.clone()],
            names: HashMap::from([(profile.dir.clone(), profile.name.clone())]),
            game: game.clone(),
            source,
            allowed: !profile.plays_hvt_map(),
            folder,
            profile,
            language: language.clone(),
            truckersmp: false,
            promods: false,
        });
    }
    // TruckersMP's, one for every profile: its other servers' map, and its ProMods servers' once a session was
    // on one; the one the game's last session played first (TruckersMP's), else right after the played
    // profile's.
    if let Some((installation, on_disk)) = &basis.truckersmp {
        let last = basis.session.as_deref().map(truckersmp::promods);
        let made = |packs: Vec<PathBuf>, promods: bool| {
            let target = map::target(game.kind, installation, true, promods);
            let resolved = maintenance.enabled(game.kind, &target) || control.requested(&target);
            let profile = truckersmp::profile_with_resolution(game.kind, installation, &packs, resolved);
            Want {
                resolved,
                game: game.clone(),
                dirs: vec![installation.clone()],
                names: HashMap::new(),
                source: if resolved {
                    map::source(game, &profile, language.as_deref())
                } else {
                    serde_json::json!({"map":profile.map})
                },
                folder: map::folder_for(maps, game, &profile),
                allowed: true,
                profile,
                language: language.clone(),
                truckersmp: true,
                promods,
            }
        };
        let others = truckersmp::remembered(&maps.join(truckersmp_record(game.kind, false)))
            .unwrap_or_else(|| on_disk.iter().map(|(pack, _)| pack.clone()).collect());
        let mut truckersmp = vec![made(others, false)];
        if let Some(packs) = truckersmp::remembered(&maps.join(truckersmp_record(game.kind, true))) {
            truckersmp.push(made(packs, true));
        }
        // The last session's first.
        truckersmp.sort_by_key(|want| Some(want.promods) != last);
        let at = if last.is_some() { 0 } else { 1 }.min(wants.len());
        wants.splice(at..at, truckersmp);
    }
    wants
}

/// Removes the maps in `maps` no profile wants any more (owner 2026-10-22): a profile deleted, its map mods
/// changed, a mod once taken for a map mod (a truck mod, before a368b80). Only WestPlay's own map folders
/// ([`map_folder_name`]); nothing while no profile has been found (the profiles' folders unread for a moment
/// would leave none wanted). Each is first renamed `<name>.removing` (at once: no longer a map, and known for
/// what it is), then removed; Windows may hold a file of it a moment (a virus scanner going through the
/// files), so one not removed whole is tried again at each look, said once (`told`).
fn remove_unused(maps: &Path, wants: &[Want], told: &mut HashSet<PathBuf>) {
    if wants.iter().any(|want| want.dirs.iter().any(|dir| dir.as_os_str().is_empty())) {
        return;
    }
    let wanted: HashSet<&Path> = wants.iter().map(|want| want.folder.as_path()).collect();
    // The listing read whole first: Windows won't rename a folder while its parent's listing is open.
    let entries: Vec<(PathBuf, String)> = std::fs::read_dir(maps)
        .into_iter()
        .flatten()
        .flatten()
        .map(|entry| (entry.path(), entry.file_name().to_string_lossy().into_owned()))
        .collect();
    for (mut folder, name) in entries {
        let removing = name.strip_suffix(REMOVING).is_some_and(map_folder_name);
        if !removing {
            if wanted.contains(folder.as_path()) || !is_map_folder(&folder) {
                continue;
            }
            let renamed = maps.join(format!("{name}{REMOVING}"));
            if let Err(error) = std::fs::rename(&folder, &renamed) {
                if told.insert(folder.clone()) {
                    log!("map {name}: no profile plays it any more; not removed yet (tried again): {error}");
                }
                continue;
            }
            folder = renamed;
            log!("map {name}: no profile plays it any more; removing it");
        }
        match remove_tree(&folder) {
            Ok(()) => log!("map {name}: removed, no profile plays it any more"),
            Err(error) => {
                if told.insert(folder) {
                    log!("map {name}: no profile plays it any more; not removed whole yet (tried again): {error}");
                }
            }
        }
    }
}

/// What a map no one wants is renamed with on its way out.
const REMOVING: &str = ".removing";

/// Removes `dir` and all in it, a file and a folder at a time, going on past one it can't (the first such
/// error returned): `std::fs::remove_dir_all` stopped at once with "used by another process" on old maps'
/// folders that these plain deletes took whole (2026-10-22, 16,795 tiles).
fn remove_tree(dir: &Path) -> std::io::Result<()> {
    let entries: Vec<std::fs::DirEntry> = std::fs::read_dir(dir)?.flatten().collect();
    let mut first_error = None;
    for entry in entries {
        let path = entry.path();
        let removed = if entry.file_type().is_ok_and(|kind| kind.is_dir()) {
            remove_tree(&path)
        } else {
            std::fs::remove_file(&path)
        };
        if let Err(error) = removed {
            first_error.get_or_insert(error);
        }
    }
    match first_error {
        Some(error) => Err(error),
        None => std::fs::remove_dir(dir),
    }
}

/// Whether a folder's name is one `map::folder` gives: `<map>-<16 hex digits>`.
fn map_folder_name(name: &str) -> bool {
    name.rsplit_once('-')
        .is_some_and(|(map, hash)| !map.is_empty() && hash.len() == 16 && hash.chars().all(|c| c.is_ascii_hexdigit()))
}

/// Whether `folder` is one of WestPlay's maps: named as `map::folder` names them, a map's manifest in it or
/// its tiles (one an earlier removal left part of).
fn is_map_folder(folder: &Path) -> bool {
    let named = folder.file_name().and_then(|name| name.to_str()).is_some_and(map_folder_name);
    let tiles = || {
        std::fs::read_dir(folder)
            .into_iter()
            .flatten()
            .flatten()
            .any(|entry| entry.file_name().to_string_lossy().starts_with("tiles-") && entry.path().is_dir())
    };
    named && (folder.join("map.json").is_file() || tiles())
}

/// A map's state without building it: not allowed, failed (and nothing it's built from changed since),
/// built, or to build (the player asked for it again, `again`).
#[cfg(test)]
fn state_of(want: &Want, failed: &Failures, again: &HashSet<PathBuf>) -> MapStatus {
    if !want.allowed {
        return MapStatus::NotAllowed;
    }
    if again.contains(&want.folder) {
        return MapStatus::Queued;
    }
    if let Some((source, error)) = failed.get(&want.folder)
        && *source == want.source
    {
        return MapStatus::Failed { error: error.clone() };
    }
    if map::needs_building(&want.folder, &want.source) { MapStatus::Queued } else { MapStatus::Ready }
}

/// Every profile's map's state, for the companion.
fn profile_maps(wants: &[Want], states: &[MapStatus]) -> Vec<ProfileMap> {
    wants
        .iter()
        .zip(states)
        .flat_map(|(want, status)| {
            let left_out: Vec<String> = match status {
                MapStatus::Ready => map::left_out(&want.folder).into_iter().map(|left| left.name).collect(),
                _ => Vec::new(),
            };
            let folder = want.folder.file_name().map(|name| name.to_string_lossy().into_owned()).unwrap_or_default();
            // As setup's check names them (app/src/setup.rs `ProfileCheck`).
            let hvt_map = want.profile.plays_hvt_map();
            let map_mods: Vec<&profiles::Mod> =
                want.profile.map_mods().filter(|m| !hvt_map && !m.is_hvt_map()).collect();
            let unreadable = map_mods.iter().filter(|m| m.problem.is_some()).count();
            let map_mods: Vec<String> = map_mods.iter().map(|m| m.name.clone()).collect();
            let map = want.profile.map.clone();
            want.dirs.iter().filter(|dir| !dir.as_os_str().is_empty()).map(move |dir| ProfileMap {
                game: want.game.kind,
                dir: dir.to_string_lossy().into_owned(),
                folder: folder.clone(),
                status: status.clone(),
                target: map::target(want.game.kind, dir, want.truckersmp, want.promods),
                name: want.names.get(dir).unwrap_or(&want.profile.name).clone(),
                auto_enabled: false,
                game_auto_enabled: false,
                has_cache: false,
                cache_state: "missing".into(),
                task_id: None,
                reason: None,
                shared_targets: Vec::new(),
                map: map.clone(),
                map_mods: map_mods.clone(),
                unreadable,
                left_out: left_out.clone(),
                truckersmp: want.truckersmp,
                promods: want.promods,
            })
        })
        .collect()
}

fn is_zero(count: &usize) -> bool {
    *count == 0
}

/// Shows the played profile's map if it's built, and builds the next map that isn't (the played profile's
/// first) if the game is closed, or waits. Returns what to show and say, and whether it built one (so the next
/// is looked at at once).
fn targets_of(want: &Want) -> Vec<String> {
    want.dirs.iter().map(|dir| map::target(want.game.kind, dir, want.truckersmp, want.promods)).collect()
}
fn auto_enabled(want: &Want, settings: &SharedSettings) -> bool {
    let policy = settings.get().map.maintenance;
    targets_of(want).iter().any(|target| policy.enabled(want.game.kind, target))
}
/// Last-good references permit mod-combination changes, but never cross a game or standalone map.
fn cache_folder(want: &Want, maps: &Path, control: &Control) -> Option<PathBuf> {
    if built_at(&want.folder).is_some() {
        return Some(want.folder.clone());
    }
    let targets = targets_of(want);
    if let Some(cache) = control.cached(&targets, &want.profile.map) {
        let folder = maps.join(cache.folder);
        if built_at(&folder).is_some() {
            return Some(folder);
        }
    }
    // Adopt old-format caches without opening any mod archive or rebuilding them.
    let active: Vec<_> = want.profile.mods.iter().map(|m| m.package.as_str()).collect();
    let mut candidates: Vec<_> = std::fs::read_dir(maps)
        .into_iter()
        .flatten()
        .flatten()
        .filter_map(|entry| {
            let folder = entry.path();
            let source = westplay_mapdata::export::built_from(&folder)?;
            if source["map"].as_str()? != want.profile.map {
                return None;
            }
            if let Some(kind) = source.get("kind") {
                if kind != &serde_json::json!(want.game.kind) {
                    return None;
                }
            } else if want.profile.map != want.game.kind.base_map() {
                return None;
            }
            if let Some(install) = source["installation"].as_str()
                && install != map::normal_path(&want.game.dir)
            {
                return None;
            }
            if !source["mods"].as_array()?.iter().all(|m| m["package"].as_str().is_some_and(|m| active.contains(&m))) {
                return None;
            }
            Some((built_at(&folder)?, folder))
        })
        .collect();
    candidates.sort_by_key(|(at, _)| std::cmp::Reverse(*at));
    candidates.into_iter().next().map(|(_, folder)| folder)
}

/// Settings and explicit cancellation remain responsive during both validation and generation.
fn watch_preparation<T>(
    task: &crate::map_tasks::Task,
    want: &Want,
    settings: &SharedSettings,
    control: &Control,
    builds: &map_process::Builds,
    run: impl FnOnce() -> T,
) -> T {
    use std::sync::atomic::{AtomicBool, Ordering};
    struct Done<'a>(&'a AtomicBool);
    impl Drop for Done<'_> {
        fn drop(&mut self) {
            self.0.store(true, Ordering::Release);
        }
    }
    let ended = AtomicBool::new(false);
    std::thread::scope(|scope| {
        scope.spawn(|| {
            while !ended.load(Ordering::Acquire) {
                let manual = control.mode(&targets_of(want)).is_some();
                if builds.stopped() || (!manual && !auto_enabled(want, settings)) {
                    let _ = control.cancel(&task.id);
                }
                if task.stop.load(Ordering::Acquire) {
                    builds.cancel_running();
                }
                std::thread::sleep(Duration::from_millis(50));
            }
        });
        let _done = Done(&ended);
        run()
    })
}

fn dependency_unreadable(folder: &Path) -> bool {
    std::fs::read(folder.join("map.json"))
        .ok()
        .and_then(|v| serde_json::from_slice::<serde_json::Value>(&v).ok())
        .is_some_and(|v| v["dependencies"]["unreadable"] == true)
}

fn cache_has_dependencies(folder: &Path) -> bool {
    std::fs::read(folder.join("map.json"))
        .ok()
        .and_then(|v| serde_json::from_slice::<serde_json::Value>(&v).ok())
        .and_then(|v| {
            serde_json::from_value::<westplay_mapdata::dependencies::Dependencies>(v["dependencies"].clone()).ok()
        })
        .is_some_and(|d| {
            d.version == westplay_mapdata::dependencies::VERSION && d.stable && !d.unreadable && !d.queries.is_empty()
        })
        && map::left_out(folder).is_empty()
}

#[allow(clippy::too_many_arguments)]
fn carry_out(
    wants: &[Want],
    maps: &Path,
    fast: bool,
    builder: Option<&Path>,
    failed: &mut Failures,
    sender: &Sender<MapUpdate>,
    sent: &mut Option<MapUpdate>,
    builds: &map_process::Builds,
    settings: &SharedSettings,
    control: &Control,
    verified: &mut HashMap<PathBuf, (String, map::CacheCheck)>,
) -> (MapUpdate, bool) {
    let mut states = vec![MapStatus::Unknown; wants.len()];
    let mut reasons: Vec<Option<String>> = vec![None; wants.len()];
    let mut caches: Vec<Option<PathBuf>> = wants.iter().map(|w| cache_folder(w, maps, control)).collect();
    let mut tasks: Vec<Option<crate::map_tasks::Task>> = vec![None; wants.len()];
    let make_update = |states: &[MapStatus],
                       caches: &[Option<PathBuf>],
                       tasks: &[Option<crate::map_tasks::Task>],
                       reasons: &[Option<String>]| {
        let mut profiles = profile_maps(wants, states);
        let policy = settings.get().map.maintenance;
        for profile in &mut profiles {
            let index = wants.iter().position(|w| targets_of(w).contains(&profile.target)).unwrap();
            profile.auto_enabled = policy.profiles.get(&profile.target).copied().unwrap_or(false);
            profile.game_auto_enabled = policy
                .games
                .get(match profile.game {
                    Kind::Ets2 => "ets2",
                    Kind::Ats => "ats",
                })
                .copied()
                .unwrap_or(false);
            profile.has_cache = caches[index].is_some();
            profile.left_out = caches[index]
                .as_ref()
                .map(|cache| map::left_out(cache).into_iter().map(|m| m.name).collect())
                .unwrap_or_default();
            let active = |i: usize| {
                tasks[i].as_ref().is_some_and(|t| control.pending(&t.id))
                    && matches!(
                        states[i],
                        MapStatus::Checking
                            | MapStatus::Queued
                            | MapStatus::WaitingForGame
                            | MapStatus::WaitingForMemory { .. }
                            | MapStatus::Building { .. }
                    )
            };
            let task_index = if active(index) {
                index
            } else {
                wants
                    .iter()
                    .enumerate()
                    .find(|(i, other)| other.folder == wants[index].folder && active(*i))
                    .map_or(index, |(i, _)| i)
            };
            let current_shared = wants
                .iter()
                .zip(states)
                .any(|(other, state)| other.folder == wants[index].folder && *state == MapStatus::Ready);
            if task_index != index {
                profile.status = states[task_index].clone();
            } else if current_shared
                && matches!(profile.status, MapStatus::Stale | MapStatus::Unverified | MapStatus::NotPrepared)
            {
                profile.status = MapStatus::Ready;
            }

            profile.cache_state = match profile.status {
                MapStatus::Ready => "current",
                MapStatus::Unverified => "unverified",
                _ if profile.has_cache => "stale",
                _ => "missing",
            }
            .into();
            profile.task_id = tasks[task_index].as_ref().filter(|_| active(task_index)).map(|t| t.id.clone());
            profile.shared_targets = wants
                .iter()
                .enumerate()
                .filter(|(other, w)| {
                    w.folder == wants[index].folder || (caches[index].is_some() && caches[index] == caches[*other])
                })
                .flat_map(|(_, w)| targets_of(w))
                .filter(|target| target != &profile.target)
                .collect();
            profile.reason = reasons[task_index].clone().or_else(|| {
                match profile.status {
                    MapStatus::Unverified => Some(
                        if caches[index].as_ref().is_some_and(|cache| {
                            westplay_mapdata::export::built_from(cache).is_some_and(|s| {
                                s.get("leftOut").and_then(|v| v.as_array()).is_some_and(|v| !v.is_empty())
                            }) || dependency_unreadable(cache)
                        }) {
                            "dependencyVerificationUnavailable"
                        } else {
                            "initializeDependencies"
                        },
                    ),
                    MapStatus::Cancelled => Some("cancelled"),
                    MapStatus::Stale => Some("notChecked"),
                    _ if !profile.auto_enabled || !profile.game_auto_enabled => Some("automaticMaintenanceDisabled"),
                    _ => None,
                }
                .map(str::to_owned)
            });
            if let Some(folder) = &caches[index] {
                profile.folder = folder.file_name().unwrap().to_string_lossy().into_owned();
            }
        }
        let cache = if states[0] == MapStatus::NotAllowed { None } else { caches[0].as_ref() };
        let status = profiles
            .iter()
            .find(|p| targets_of(&wants[0]).contains(&p.target))
            .map(|p| p.status.clone())
            .unwrap_or_else(|| states[0].clone());
        MapUpdate {
            folder: cache.and_then(|p| p.file_name()).map(|v| v.to_string_lossy().into_owned()),
            built: cache.and_then(|p| built_at(p)),
            status,
            profiles,
        }
    };
    let mut next = None;
    for (index, want) in wants.iter().enumerate() {
        let targets = targets_of(want);
        if let Some(cache) = &caches[index] {
            control.remember(&targets, &want.profile.map, cache);
        }
        if !want.allowed {
            states[index] = MapStatus::NotAllowed;
            continue;
        }
        let manual = control.mode(&targets);
        let enabled = auto_enabled(want, settings);
        let key = want.folder.to_string_lossy().into_owned();
        let mut identity = want.source.clone();
        if let Some(fields) = identity.as_object_mut() {
            fields.remove("profileWritten");
        }
        let input = identity.to_string();
        let hint = want.source.to_string();
        if manual.is_some() {
            control.clear_cancel(&key);
        }
        if manual.is_none() && (control.cancelled(&key, &input) || (!want.resolved && control.has_cancelled(&key))) {
            states[index] = MapStatus::Cancelled;
            continue;
        }
        if manual.is_none() && (!enabled || !want.resolved) {
            states[index] = match &caches[index] {
                None => MapStatus::NotPrepared,
                Some(cache) => {
                    let has_deps = cache_has_dependencies(cache);
                    if has_deps { MapStatus::Stale } else { MapStatus::Unverified }
                }
            };
            continue;
        }
        if let Some((source, error)) = failed.get(&want.folder)
            && source == &want.source
            && manual.is_none()
        {
            states[index] = MapStatus::Failed { error: error.clone() };
            continue;
        }
        let task = control.register(&key, &input, targets.clone(), maps);
        tasks[index] = Some(task.clone());
        let check = if manual == Some(true) {
            map::CacheCheck::Changed("forced".into())
        } else if manual.is_none()
            && verified.get(&want.folder).is_some_and(|(hint, _)| hint == &want.source.to_string())
        {
            verified[&want.folder].1.clone()
        } else if let Some(cache) = &caches[index] {
            states[index] = MapStatus::Checking;
            let update = make_update(&states, &caches, &tasks, &reasons);
            let _ = sender.send(update.clone());
            *sent = Some(update);
            let started = std::time::Instant::now();
            let before_reads = westplay_mapdata::files::verification_totals();
            let before_bytes = westplay_mapdata::files::verification_bytes();
            match watch_preparation(&task, want, settings, control, builds, || {
                map::check_cache_controlled(
                    cache,
                    &want.game,
                    &want.profile,
                    want.language.as_deref(),
                    true,
                    Some(&task.stop),
                )
            }) {
                Ok(check) => {
                    let after = westplay_mapdata::files::verification_totals();
                    log!(
                        "map validation {}: {:?}, {:.3} s, {} queries read, {} bytes read, {} reused, complete generation: {}",
                        task.id,
                        check,
                        started.elapsed().as_secs_f64(),
                        after.0 - before_reads.0,
                        westplay_mapdata::files::verification_bytes() - before_bytes,
                        after.1 - before_reads.1,
                        matches!(check, map::CacheCheck::Changed(_))
                            || (check == map::CacheCheck::Unverified && manual.is_some())
                    );
                    check
                }
                Err(_) if task.stop.load(std::sync::atomic::Ordering::Acquire) => {
                    states[index] = MapStatus::Cancelled;
                    control.finish(&task);
                    continue;
                }
                Err(error) => {
                    let error = error.to_string();
                    failed.insert(want.folder.clone(), (want.source.clone(), error.clone()));
                    states[index] = MapStatus::Failed { error };
                    control.consume(&targets);
                    control.finish(&task);
                    continue;
                }
            }
        } else {
            map::CacheCheck::Missing
        };
        if task.stop.load(std::sync::atomic::Ordering::Acquire) {
            states[index] = MapStatus::Cancelled;
            control.finish(&task);
            continue;
        }
        reasons[index] = match &check {
            map::CacheCheck::Changed(reason) => Some(reason.clone()),
            map::CacheCheck::Missing => Some("noCache".into()),
            _ => None,
        };
        verified.insert(want.folder.clone(), (hint, check.clone()));
        match check {
            map::CacheCheck::Current => {
                states[index] = MapStatus::Ready;
                control.consume(&targets);
                control.finish(&task);
            }
            map::CacheCheck::Unverified if manual.is_none() => {
                states[index] = MapStatus::Unverified;
                control.finish(&task);
            }
            map::CacheCheck::Changed(ref reason) if reason == "inputsChangedDuringCheck" => {
                states[index] = MapStatus::Checking;
                control.finish(&task);
                verified.remove(&want.folder);
                control.recheck();
            }
            _ => {
                states[index] = MapStatus::Queued;
                if next.is_none() {
                    next = Some(index);
                }
            }
        }
    }
    control.retire_except(&tasks.iter().flatten().map(|t| t.id.clone()).collect());
    let Some(next) = next else { return (make_update(&states, &caches, &tasks, &reasons), false) };
    if westplay_setup::game::running() {
        states[next] = MapStatus::WaitingForGame;
        return (make_update(&states, &caches, &tasks, &reasons), false);
    }
    if let Some(free) = memory_short(memory()) {
        states[next] = MapStatus::WaitingForMemory { needed: MEMORY_NEEDED, free };
        return (make_update(&states, &caches, &tasks, &reasons), false);
    }
    let want = &wants[next];
    let targets = targets_of(want);
    let manual = control.mode(&targets).is_some();
    let task = tasks[next].as_ref().unwrap().clone();
    if let Err(error) = control.start(&task) {
        states[next] = MapStatus::Failed { error: error.to_string() };
        return (make_update(&states, &caches, &tasks, &reasons), false);
    }
    let before_output: HashSet<PathBuf> =
        std::fs::read_dir(&want.folder).into_iter().flatten().flatten().map(|e| e.path()).collect();
    let request = map_builder::Request {
        game: want.game.clone(),
        profile: want.profile.clone(),
        language: want.language.clone(),
        maps: maps.to_owned(),
        fast,
        commit_file: Some(task.decision.clone()),
    };
    if manual {
        control.clear_cancel(&task.key);
    }
    let build_started = std::time::Instant::now();
    let ended = watch_preparation(&task, want, settings, control, builds, || {
        let mut last_told = -1.0f32;
        let mut last_stage = None;
        map_process::build_controlled(builder, &request, builds, &task.stop, &mut |said| {
            if let map_builder::Said::Progress { stage, done, .. } = said
                && let Some(progress) = map_builder::progress_of(&stage, done, None)
            {
                let stage = MapStage::of(&progress);
                if last_stage.as_ref() == Some(&stage) && progress.done - last_told < 0.01 {
                    return;
                }
                last_told = progress.done;
                last_stage = Some(stage);
                states[next] = MapStatus::Building { done: progress.done, stage };
                let update = make_update(&states, &caches, &tasks, &reasons);
                let _ = sender.send(update.clone());
                *sent = Some(update);
            }
        })
    });
    log!(
        "map preparation {}: complete generation invoked, {:.3} s, {}",
        task.id,
        build_started.elapsed().as_secs_f64(),
        if matches!(ended, map_builder::Said::Built(_)) { "published" } else { "not published" }
    );
    let was_cancelled = task.stop.load(std::sync::atomic::Ordering::Acquire);
    if !matches!(
        ended,
        map_builder::Said::Failed(map_builder::Failure::InputsChanged | map_builder::Failure::GameRunning)
    ) {
        control.consume(&targets);
    }
    if matches!(ended, map_builder::Said::Failed(map_builder::Failure::GameRunning)) {
        control.park(&task);
    } else {
        control.finish(&task);
    }
    if was_cancelled {
        for entry in std::fs::read_dir(&want.folder).into_iter().flatten().flatten() {
            let path = entry.path();
            if !before_output.contains(&path)
                && entry.file_type().is_ok_and(|t| t.is_dir() && !t.is_symlink())
                && entry.file_name().to_string_lossy().starts_with("tiles-")
            {
                let _ = std::fs::remove_dir_all(path);
            }
        }
        let _ = std::fs::remove_file(want.folder.join("map.json.partial"));
        states[next] = MapStatus::Cancelled;
    } else {
        match ended {
            map_builder::Said::Built(_) => {
                states[next] =
                    if cache_has_dependencies(&want.folder) { MapStatus::Ready } else { MapStatus::Unverified };
                for (index, other) in wants.iter().enumerate().filter(|(_, other)| other.folder == want.folder) {
                    caches[index] = Some(want.folder.clone());
                    control.remember(&targets_of(other), &other.profile.map, &want.folder);
                }
                control.remember(&targets, &want.profile.map, &want.folder);
                failed.remove(&want.folder);
                verified.insert(
                    want.folder.clone(),
                    (
                        want.source.to_string(),
                        if states[next] == MapStatus::Ready {
                            map::CacheCheck::Current
                        } else {
                            map::CacheCheck::Unverified
                        },
                    ),
                );
            }
            map_builder::Said::Failed(map_builder::Failure::GameRunning) => {
                states[next] = MapStatus::WaitingForGame;
                return (make_update(&states, &caches, &tasks, &reasons), false);
            }
            map_builder::Said::Failed(map_builder::Failure::Cancelled) => states[next] = MapStatus::Cancelled,
            map_builder::Said::Failed(map_builder::Failure::InputsChanged) => {
                states[next] = MapStatus::Checking;
                verified.remove(&want.folder);
                control.recheck();
            }
            map_builder::Said::Failed(map_builder::Failure::Error { error }) => {
                failed.insert(want.folder.clone(), (want.source.clone(), error.clone()));
                states[next] = MapStatus::Failed { error };
            }
            _ => states[next] = MapStatus::Failed { error: "Map preparation ended unexpectedly".into() },
        }
    }
    (make_update(&states, &caches, &tasks, &reasons), true)
}

pub(crate) fn panic_message(panic: &(dyn std::any::Any + Send)) -> String {
    panic
        .downcast_ref::<&str>()
        .map(|text| text.to_string())
        .or_else(|| panic.downcast_ref::<String>().cloned())
        .unwrap_or_else(|| "an error WestPlay didn't expect".into())
}

/// The memory WestPlay has taken (its private bytes, what it holds whether in RAM or paged out).
pub(crate) fn process_memory() -> Option<u64> {
    use windows::Win32::System::ProcessStatus::{
        GetProcessMemoryInfo, PROCESS_MEMORY_COUNTERS, PROCESS_MEMORY_COUNTERS_EX,
    };
    use windows::Win32::System::Threading::GetCurrentProcess;
    let mut counters =
        PROCESS_MEMORY_COUNTERS_EX { cb: size_of::<PROCESS_MEMORY_COUNTERS_EX>() as u32, ..Default::default() };
    // SAFETY: `counters` is a local with its size set, read as the larger form the size says it is.
    unsafe {
        GetProcessMemoryInfo(GetCurrentProcess(), (&raw mut counters).cast::<PROCESS_MEMORY_COUNTERS>(), counters.cb)
    }
    .ok()?;
    Some(counters.PrivateUsage as u64)
}

#[cfg(test)]
fn gigabytes(bytes: u64) -> String {
    format!("{:.1} GB", bytes as f64 / (1u64 << 30) as f64)
}

/// The PC's memory in all (bytes).
pub(crate) fn total_memory() -> Option<u64> {
    memory().map(|(_, total)| total)
}

/// The PC's memory: free now, and in all (bytes); `None` if Windows doesn't say.
fn memory() -> Option<(u64, u64)> {
    use windows::Win32::System::SystemInformation::{GlobalMemoryStatusEx, MEMORYSTATUSEX};
    let mut status = MEMORYSTATUSEX { dwLength: size_of::<MEMORYSTATUSEX>() as u32, ..Default::default() };
    // SAFETY: `status` is a local with its size set, as the call requires.
    unsafe { GlobalMemoryStatusEx(&mut status) }.ok()?;
    Some((status.ullAvailPhys, status.ullTotalPhys))
}

/// What's free, when a build has to wait for more: the PC has enough memory in all but not free now. One that
/// hasn't enough in all doesn't wait (it never would have): it builds, slower.
fn memory_short(memory: Option<(u64, u64)>) -> Option<u64> {
    let (free, total) = memory?;
    (total >= MEMORY_NEEDED && free < MEMORY_NEEDED).then_some(free)
}

/// When the map in `folder` was built (its manifest written), if it has been.
fn built_at(folder: &Path) -> Option<u64> {
    let written = std::fs::metadata(folder.join("map.json")).and_then(|m| m.modified()).ok()?;
    written.duration_since(SystemTime::UNIX_EPOCH).ok().map(|since| since.as_secs())
}

/// `{"type":"map","folder":"europe-cbf29ce484222325","built":1792112933}`: the map the cab shows, in WestPlay's
/// maps folder (served at `https://westplay.maps/`), and when it was built; `null` for none.
pub fn preparation_message(state: &MapStatus, cached: bool) -> String {
    serde_json::json!({"type":"mapPreparation","state":state,"cached":cached}).to_string()
}
pub fn map_message(folder: Option<&str>, built: Option<u64>) -> String {
    serde_json::json!({ "type": "map", "folder": folder, "built": built }).to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_panic_caught_says_what_it_said() {
        let caught = |run: fn()| panic_message(&*std::panic::catch_unwind(run).unwrap_err());
        // The player's (2.0.3): a clamp's own message, formatted.
        assert_eq!(
            caught(|| panic!("min > max. min = {}, max = {}", 65536, 42304)),
            "min > max. min = 65536, max = 42304"
        );
        assert_eq!(caught(|| panic!("a plain message")), "a plain message");
        assert_eq!(caught(|| std::panic::panic_any(7)), "an error WestPlay didn't expect");
    }

    #[test]
    fn tells_the_cab_its_maps_folder() {
        assert_eq!(map_message(Some("europe-1"), Some(7)), r#"{"built":7,"folder":"europe-1","type":"map"}"#);
        assert_eq!(map_message(None, None), r#"{"built":null,"folder":null,"type":"map"}"#);
    }

    #[test]
    fn logs_the_memory_a_build_takes() {
        // This process's own: something, and less than the PC has.
        let taken = process_memory().unwrap();
        assert!(taken > 0 && taken < memory().unwrap().1, "{taken}");
        assert_eq!(gigabytes(6 * (1 << 30) + (1 << 29)), "6.5 GB");
    }

    #[test]
    fn looks_at_once_when_setup_sets_the_game() {
        let set_up = Arc::new(SetUpGame::default());
        let setter = set_up.clone();
        let started = std::time::Instant::now();
        let thread = std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(50));
            setter.set(vec![PathBuf::from("game")]);
        });
        set_up.wait_for_another(&SetUp::default(), Duration::from_secs(10), &map_process::Builds::default());
        assert!(started.elapsed() < Duration::from_secs(5));
        assert_eq!(set_up.get(), [PathBuf::from("game")]);
        thread.join().unwrap();
    }

    #[test]
    fn looks_at_once_when_the_player_asks_to_prepare_the_maps_again() {
        let set_up = Arc::new(SetUpGame::new(vec![PathBuf::from("game")]));
        let known = set_up.state().clone();
        set_up.control.known(["ets2:profile".to_owned()].into_iter());
        let asker = set_up.clone();
        let started = std::time::Instant::now();
        let thread = std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(50));
            asker.prepare_maps(vec!["ets2:profile".into()], false).unwrap();
        });
        set_up.wait_for_another(&known, Duration::from_secs(10), &map_process::Builds::default());
        assert!(started.elapsed() < Duration::from_secs(5));
        assert_eq!(set_up.state().asked_again, 1);
        thread.join().unwrap();
    }

    /// A watch waiting between two looks stops at once when it's stopped (its host's run ending), so the next run's
    /// watch never runs beside it.
    #[test]
    fn a_watch_waiting_stops_at_once() {
        let set_up = Arc::new(SetUpGame::new(vec![PathBuf::from("game")]));
        let known = set_up.state().clone();
        let builds = Arc::new(map_process::Builds::default());
        let (waker, stopper) = (set_up.clone(), builds.clone());
        let started = std::time::Instant::now();
        let thread = std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(50));
            stopper.stop();
            waker.wake();
        });
        set_up.wait_for_another(&known, Duration::from_secs(10), &builds);
        assert!(started.elapsed() < Duration::from_secs(5));
        thread.join().unwrap();
    }

    /// A map watch dropped (its host's run ending) has its thread gone: no watch left running beside the next.
    #[test]
    fn a_map_watch_ends_with_its_handle() {
        let maps = std::env::temp_dir().join(format!("westplay-watch-ends-{}", std::process::id()));
        let set_up = Arc::new(SetUpGame::new(Vec::new()));
        let settings = Arc::new(SharedSettings::new(crate::settings::Settings::default()));
        // As with a builder: the drop waits for the thread.
        let watch = MapWatch::start(maps.clone(), set_up, settings, Some(PathBuf::from("no-such-builder.exe")));
        std::thread::sleep(Duration::from_millis(200));
        let started = std::time::Instant::now();
        drop(watch);
        assert!(started.elapsed() < Duration::from_secs(5), "{:?}", started.elapsed());
        let _ = std::fs::remove_dir_all(&maps);
    }

    #[test]
    fn asks_made_before_a_look_add_up() {
        let set_up = SetUpGame::new(Vec::new());
        set_up.control.known(["ets2:a".into(), "ats:b".into()].into_iter());
        set_up.prepare_maps(vec!["ets2:a".into()], false).unwrap();
        set_up.prepare_maps(vec!["ats:b".into()], true).unwrap();
        assert_eq!(set_up.control.mode(&["ets2:a".into()]), Some(false));
        assert_eq!(set_up.control.mode(&["ats:b".into()]), Some(true));
        assert!(set_up.prepare_maps(Vec::new(), true).is_err());
        assert!(set_up.prepare_maps(vec!["unknown".into()], true).is_err());
        set_up.control.consume(&["ets2:a".into()]);
        assert!(!set_up.control.requested("ets2:a"));
        assert!(set_up.control.requested("ats:b"));
        assert_eq!(set_up.state().asked_again, 2);
    }

    fn a_want(dirs: &[&str], folder: &str, allowed: bool) -> Want {
        Want {
            resolved: true,
            names: HashMap::new(),
            game: Game {
                kind: Kind::Ets2,
                dir: PathBuf::from("game"),
                found_by: westplay_setup::game::FoundBy::Steam,
                version: None,
                dlcs: vec![],
            },
            profile: profiles::Profile::new_player(Kind::Ets2),
            dirs: dirs.iter().map(PathBuf::from).collect(),
            folder: PathBuf::from(folder),
            source: serde_json::json!({ "mods": [] }),
            language: None,
            allowed,
            truckersmp: false,
            promods: false,
        }
    }

    /// Each profile's map and map mods go to the companion with its map's state, as worked out from the profile at
    /// that look: a mod turned off since leaves the row, an unreadable one is counted, other mods aren't named.
    #[test]
    fn tells_the_companion_what_each_profile_plays_now() {
        let a_mod = |name: &str, sectors: &[&str], definitions: bool, problem: Option<&str>| profiles::Mod {
            package: name.to_owned(),
            name: name.to_owned(),
            files: Some(PathBuf::from(name)),
            categories: Vec::new(),
            author: None,
            map: profiles::MapContent {
                sectors: sectors.iter().map(|map| (*map).to_owned()).collect(),
                definitions,
                hidden: false,
            },
            problem: problem.map(str::to_owned),
        };
        let mut with_mod = a_want(&["profiles/57"], "maps/europe-a", true);
        with_mod.profile.map = "europe".into();
        with_mod.profile.mods = vec![
            a_mod("Grand Utopia", &["grandutopia"], true, None),
            a_mod("A truck", &[], false, None),
            a_mod("Broken roads", &["europe"], false, Some("unreadable")),
        ];
        let plain = a_want(&["profiles/58"], "maps/europe-b", true);
        let told = profile_maps(&[with_mod, plain], &[MapStatus::Queued, MapStatus::Queued]);
        assert_eq!(told[0].map, "europe");
        assert_eq!(told[0].map_mods, ["Grand Utopia", "Broken roads"]);
        assert_eq!(told[0].unreadable, 1);
        assert_eq!(told[1].map_mods, Vec::<String>::new(), "turned off: none named");
        let json = serde_json::to_value(&told[1]).unwrap();
        assert_eq!(json["map"], "europe");
        assert!(json.get("mapMods").is_none() && json.get("unreadable").is_none());
    }

    #[test]
    fn removes_the_maps_no_profile_wants() {
        let maps = std::env::temp_dir().join(format!("westplay-unused-maps-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&maps);
        let map = |name: &str| {
            let folder = maps.join(name);
            std::fs::create_dir_all(folder.join("tiles-1")).unwrap();
            std::fs::write(folder.join("map.json"), "{}").unwrap();
            folder
        };
        // Two maps wanted (a profile's, TruckersMP's), one a truck mod once made (unwanted), a folder named as a
        // map with no manifest, another of the player's, TruckersMP's record.
        let (played, truckersmp, old) =
            (map("europe-cbf29ce484222325"), map("europe-6350e2ab6a0e4959"), map("europe-9d0794bb7c00b91b"));
        std::fs::create_dir_all(maps.join("europe-0123456789abcdef")).unwrap();
        std::fs::create_dir_all(maps.join("my maps")).unwrap();
        // One an earlier removal left part of (its manifest gone, tiles left), and one renamed on its way out.
        let half = maps.join("europe-6c17f8cb18ac028c");
        std::fs::create_dir_all(half.join("tiles-2").join("14")).unwrap();
        let leaving = maps.join("europe-1111111111111111.removing");
        std::fs::create_dir_all(leaving.join("tiles-3")).unwrap();
        std::fs::write(maps.join(truckersmp_record(Kind::Ets2, false)), "[]").unwrap();
        let wants = [
            a_want(&["profiles/57"], played.to_str().unwrap(), true),
            a_want(&["TruckersMP"], truckersmp.to_str().unwrap(), true),
        ];
        // No profile found yet (a new player's map only): nothing removed.
        let new_player = [a_want(&[""], played.to_str().unwrap(), true)];
        remove_unused(&maps, &new_player, &mut HashSet::new());
        assert!(old.is_dir());
        remove_unused(&maps, &wants, &mut HashSet::new());
        assert!(!old.exists() && !half.exists() && !leaving.exists());
        assert!(!maps.join("europe-9d0794bb7c00b91b.removing").exists());
        assert!(played.join("tiles-1").is_dir() && truckersmp.join("map.json").is_file());
        assert!(maps.join("europe-0123456789abcdef").is_dir() && maps.join("my maps").is_dir());
        assert!(maps.join(truckersmp_record(Kind::Ets2, false)).is_file());
        let _ = std::fs::remove_dir_all(&maps);
    }

    #[test]
    fn every_profile_has_its_maps_state() {
        // The played profile's map, one two profiles share, and a new player's (no profile folder).
        // And an ATS profile's, after ETS2's.
        let mut ats = a_want(&["ats/d"], "maps/usa-1", true);
        ats.game.kind = Kind::Ats;
        let wants = [a_want(&["p/a"], "maps/europe-1", true), a_want(&["p/b", "p/c"], "maps/europe-2", true), ats];
        let states = [MapStatus::Ready, MapStatus::Queued, MapStatus::Queued];
        let listed: Vec<(Kind, String, MapStatus)> =
            profile_maps(&wants, &states).into_iter().map(|each| (each.game, each.dir, each.status)).collect();
        assert_eq!(
            listed,
            [
                (Kind::Ets2, "p/a".to_owned(), MapStatus::Ready),
                (Kind::Ets2, "p/b".to_owned(), MapStatus::Queued),
                (Kind::Ets2, "p/c".to_owned(), MapStatus::Queued),
                (Kind::Ats, "ats/d".to_owned(), MapStatus::Queued),
            ]
        );
        assert!(profile_maps(&[a_want(&[""], "maps/europe-1", true)], &[MapStatus::Ready]).is_empty());
    }

    #[test]
    fn a_failed_map_is_tried_again_only_once_what_its_built_from_changes() {
        let mut want = a_want(&["p/a"], "maps-that-are-not-here/europe-1", true);
        let mut failed = Failures::new();
        let none = HashSet::new();
        assert_eq!(state_of(&want, &failed, &none), MapStatus::Queued);
        failed.insert(want.folder.clone(), (want.source.clone(), "sector version 903".into()));
        assert_eq!(state_of(&want, &failed, &none), MapStatus::Failed { error: "sector version 903".into() });
        // The player asks for it again: built again, the failure aside.
        assert_eq!(state_of(&want, &failed, &HashSet::from([want.folder.clone()])), MapStatus::Queued);
        // A mod updated: built again.
        want.source = serde_json::json!({ "mods": ["updated"] });
        assert_eq!(state_of(&want, &failed, &none), MapStatus::Queued);
        // HVT's: never, even asked for again.
        let hvt = a_want(&["p/h"], "maps/hvtmap-1", false);
        assert_eq!(state_of(&hvt, &failed, &HashSet::from([hvt.folder.clone()])), MapStatus::NotAllowed);
    }

    #[test]
    fn tells_what_the_build_is_doing() {
        let at = |stage, done| MapStage::of(&Progress { stage, done, size: None });
        assert_eq!(at(Stage::Reading, 0.0), MapStage::Reading);
        assert_eq!(at(Stage::Drawing, 0.15), MapStage::Drawing);
        assert_eq!(at(Stage::Tiles, 0.6), MapStage::Tiles);
        assert_eq!(at(Stage::Tiles, 0.95), MapStage::Saving);
        assert_eq!(at(Stage::Done, 1.0), MapStage::Saving);
    }

    #[test]
    fn tells_the_companion_the_maps_state() {
        let json = |status: MapStatus| serde_json::to_value(status).unwrap();
        assert_eq!(
            json(MapStatus::Building { done: 0.5, stage: MapStage::Drawing }),
            serde_json::json!({ "state": "building", "done": 0.5, "stage": "drawing" })
        );
        assert_eq!(json(MapStatus::WaitingForGame), serde_json::json!({ "state": "waitingForGame" }));
        assert_eq!(
            json(MapStatus::WaitingForMemory { needed: 3, free: 1 }),
            serde_json::json!({ "state": "waitingForMemory", "needed": 3, "free": 1 })
        );
    }

    /// A PC with the memory free builds; one with enough but not free waits; one without enough at all
    /// builds anyway (it would wait for ever).
    #[test]
    fn waits_for_memory_only_when_it_will_come() {
        const GB: u64 = 1_000_000_000;
        assert_eq!(memory_short(Some((10 * GB, 32 * GB))), None);
        assert_eq!(memory_short(Some((2 * GB, 32 * GB))), Some(2 * GB));
        assert_eq!(memory_short(Some((GB, 3 * GB))), None);
        assert_eq!(memory_short(None), None);
        let (free, total) = memory().expect("Windows says");
        assert!(free > 0 && total >= free);
    }
}

#[cfg(test)]
#[path = "map_preparation_tests.rs"]
mod preparation_tests;
