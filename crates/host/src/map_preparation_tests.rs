use super::*;
use crate::settings::{MapMaintenance, Settings};

fn fixture() -> (PathBuf, Want) {
    static N: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    let dir = std::env::temp_dir().join(format!(
        "westplay-selective-{}-{}",
        std::process::id(),
        N.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
    ));
    std::fs::create_dir_all(&dir).unwrap();
    let game = Game {
        kind: Kind::Ets2,
        dir: dir.join("game"),
        found_by: westplay_setup::game::FoundBy::Chosen,
        version: None,
        dlcs: vec![],
    };
    std::fs::create_dir_all(&game.dir).unwrap();
    let mut profile = profiles::Profile::new_player(Kind::Ets2);
    profile.dir = dir.join("profiles/a");
    profile.name = "A".into();
    let want = Want {
        resolved: false,
        names: HashMap::new(),
        folder: dir.join("maps/europe-0123456789abcdef"),
        source: serde_json::json!({"map":"europe"}),
        game,
        dirs: vec![profile.dir.clone()],
        profile,
        language: None,
        allowed: true,
        truckersmp: false,
        promods: false,
    };
    (dir, want)
}

fn run(wants: &[Want], dir: &Path, settings: &SharedSettings, control: &Control) -> (MapUpdate, bool) {
    let (tx, _rx) = mpsc::channel();
    carry_out(
        wants,
        &dir.join("maps"),
        false,
        Some(Path::new("nonexistent-map-builder.exe")),
        &mut Failures::new(),
        &tx,
        &mut None,
        &map_process::Builds::default(),
        settings,
        control,
        &mut HashMap::new(),
    )
}

#[test]
fn defaults_never_open_or_prepare_unselected_games() {
    let (dir, want) = fixture();
    std::fs::write(want.game.dir.join("base.scs"), b"invalid archive must not be opened").unwrap();
    let control = Control::default();
    control.load(&dir.join("maps"));
    let (update, more) = run(std::slice::from_ref(&want), &dir, &SharedSettings::default(), &control);
    assert_eq!(update.status, MapStatus::NotPrepared);
    assert!(!more);
    assert!(!dir.join("maps").exists());
    assert!(!update.profiles[0].auto_enabled);
    assert!(update.profiles[0].task_id.is_none());
    drop(control);
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn enabling_legacy_cache_requires_manual_initialization() {
    let (dir, mut want) = fixture();
    want.resolved = true;
    std::fs::create_dir_all(&want.folder).unwrap();
    std::fs::write(want.folder.join("map.json"), b"{\"source\":{\"map\":\"europe\"}}").unwrap();
    let mut settings = Settings::default();
    let target = targets_of(&want)[0].clone();
    settings.map.maintenance.games.insert("ets2".into(), true);
    settings.map.maintenance.profiles.insert(target, true);
    let control = Control::default();
    control.load(&dir.join("maps"));
    let (update, more) = run(&[want], &dir, &SharedSettings::new(settings), &control);
    assert_eq!(update.status, MapStatus::Unverified);
    assert!(!more);
    assert!(update.folder.is_some());
    assert!(update.profiles[0].task_id.is_none());
    drop(control);
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn maintenance_needs_both_switches_and_keeps_profile_choice() {
    let mut policy = MapMaintenance::default();
    let key = map::target(Kind::Ats, Path::new("C:/Profiles/A"), false, false);
    assert_eq!(key, map::target(Kind::Ats, Path::new("c:\\profiles\\a/"), false, false));
    policy.profiles.insert(key.clone(), true);
    assert!(!policy.enabled(Kind::Ats, &key));
    policy.games.insert("ats".into(), true);
    assert!(policy.enabled(Kind::Ats, &key));
    policy.games.insert("ats".into(), false);
    assert!(!policy.enabled(Kind::Ats, &key));
    assert_eq!(policy.profiles.get(&key), Some(&true));
    assert!(!policy.enabled(Kind::Ets2, &key));
}

#[test]
fn targets_include_game_and_truckersmp_variant() {
    let path = Path::new("C:/TruckersMP");
    let a = map::target(Kind::Ets2, path, true, false);
    assert_ne!(a, map::target(Kind::Ats, path, true, false));
    assert_ne!(a, map::target(Kind::Ets2, path, true, true));
}

fn current_fixture(want: &mut Want) {
    want.resolved = true;
    want.source = map::source(&want.game, &want.profile, None);
    let files = westplay_mapdata::files::GameFiles::install(&want.game.dir).unwrap();
    files.track_dependencies();
    files.read("not-present-but-queried").unwrap();
    let mut source = want.source.clone();
    source["semantic"] = map::semantic_source(&want.game, &want.profile, None);
    std::fs::create_dir_all(&want.folder).unwrap();
    std::fs::write(
        want.folder.join("map.json"),
        serde_json::to_vec(&serde_json::json!({"source":source,"dependencies":files.dependencies()})).unwrap(),
    )
    .unwrap();
}

#[test]
fn one_off_validation_bypasses_switches_without_enabling_them_and_force_really_builds() {
    let (dir, mut want) = fixture();
    current_fixture(&mut want);
    let control = Control::default();
    control.load(&dir.join("maps"));
    let targets = targets_of(&want);
    control.known(targets.clone().into_iter());
    let settings = SharedSettings::default();
    control.request(targets.clone(), false).unwrap();
    let (update, more) = run(std::slice::from_ref(&want), &dir, &settings, &control);
    assert_eq!(update.status, MapStatus::Ready);
    assert!(!more);
    assert!(!control.requested(&targets[0]));
    assert!(!settings.get().map.maintenance.enabled(Kind::Ets2, &targets[0]));
    control.request(targets, true).unwrap();
    let (update, more) = run(&[want], &dir, &settings, &control);
    assert!(matches!(update.status, MapStatus::Failed { .. }));
    assert!(more); // The deliberately nonexistent builder was invoked.
    drop(control);
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn a_shared_task_stays_enabled_for_its_other_profile_and_preserves_each_name() {
    let (dir, mut want) = fixture();
    current_fixture(&mut want);
    want.dirs.push(dir.join("profiles/b"));
    want.names.insert(want.dirs[0].clone(), "Alice".into());
    want.names.insert(want.dirs[1].clone(), "Bob".into());
    let targets = targets_of(&want);
    let mut settings = Settings::default();
    settings.map.maintenance.games.insert("ets2".into(), true);
    settings.map.maintenance.profiles.insert(targets[0].clone(), false);
    settings.map.maintenance.profiles.insert(targets[1].clone(), true);
    let settings = SharedSettings::new(settings);
    assert!(auto_enabled(&want, &settings));
    let control = Control::default();
    control.load(&dir.join("maps"));
    let (update, more) = run(&[want], &dir, &settings, &control);
    assert!(!more);
    assert_eq!(update.status, MapStatus::Ready);
    assert_eq!(update.profiles.len(), 2);
    assert_eq!(update.profiles[0].name, "Alice");
    assert_eq!(update.profiles[1].name, "Bob");
    assert!(!update.profiles[0].auto_enabled);
    assert!(update.profiles[1].auto_enabled);
    assert_eq!(update.profiles[0].folder, update.profiles[1].folder);
    drop(control);
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn disabling_the_last_auto_consumer_cancels_running_work_but_one_off_work_survives() {
    let (dir, want) = fixture();
    let targets = targets_of(&want);
    let control = Control::default();
    control.load(&dir.join("maps"));
    control.known(targets.clone().into_iter());
    let task = control.register("auto", "inputs", targets.clone(), &dir.join("maps"));
    control.start(&task).unwrap();
    let settings = SharedSettings::default();
    let builds = map_process::Builds::default();
    watch_preparation(&task, &want, &settings, &control, &builds, || {
        let start = std::time::Instant::now();
        while !task.stop.load(std::sync::atomic::Ordering::Acquire) && start.elapsed() < Duration::from_secs(2) {
            std::thread::sleep(Duration::from_millis(10));
        }
    });
    assert!(task.stop.load(std::sync::atomic::Ordering::Acquire));
    assert!(!builds.stopped());
    control.finish(&task);
    control.request(targets.clone(), false).unwrap();
    let task = control.register("manual", "inputs", targets, &dir.join("maps"));
    control.start(&task).unwrap();
    watch_preparation(&task, &want, &settings, &control, &builds, || std::thread::sleep(Duration::from_millis(120)));
    assert!(!task.stop.load(std::sync::atomic::Ordering::Acquire));
    control.finish(&task);
    drop(control);
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn ordinary_profile_writes_do_not_clear_cancellation() {
    let (dir, mut want) = fixture();
    want.resolved = true;
    let control = Control::default();
    control.load(&dir.join("maps"));
    let targets = targets_of(&want);
    want.source = serde_json::json!({"map":"europe","profileWritten":"before"});
    let task = control.register(&want.folder.to_string_lossy(), "{\"map\":\"europe\"}", targets, &dir.join("maps"));
    control.cancel(&task.id).unwrap();
    want.source["profileWritten"] = serde_json::json!("after");
    let (update, more) = run(&[want], &dir, &SharedSettings::default(), &control);
    assert_eq!(update.status, MapStatus::Cancelled);
    assert!(!more);
    drop(control);
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn lightweight_discovery_merges_unselected_profiles_with_the_selected_consumer() {
    let (dir, want) = fixture();
    let documents = dir.join("documents");
    let mod_dir = documents.join("mod");
    std::fs::create_dir_all(&mod_dir).unwrap();
    std::fs::write(mod_dir.join("roads.scs"), b"deliberately invalid archive").unwrap();
    for name in ["Alice", "Bob"] {
        let profile = documents.join("profiles").join(name);
        std::fs::create_dir_all(&profile).unwrap();
        let content = format!(
            r#"SiiNunit
{{
user_profile : _nameless.profile {{
profile_name: "{name}"
map_path: "/map/europe.mbd"
active_mods[]: "roads|Roads"
}}
}}
"#
        );
        std::fs::write(profile.join("profile.sii"), content).unwrap();
    }
    let all = profiles::find_with_resolution(Kind::Ets2, &documents, None, Some(&want.game), &|_| false);
    assert_eq!(all.len(), 2);
    assert!(all.iter().all(|p| p.mods[0].files.is_none() && p.mods[0].problem.is_none()));
    let bob = documents.join("profiles/Bob");
    let target = map::target(Kind::Ets2, &bob, false, false);
    let mut policy = Settings::default();
    policy.map.maintenance.games.insert("ets2".into(), true);
    policy.map.maintenance.profiles.insert(target, true);
    let basis = Basis {
        selection: 0,
        game: want.game.dir.clone(),
        selected: Some("Alice".into()),
        profile: None,
        profiles: vec![],
        game_written: None,
        truckersmp: None,
        session: None,
        round: 0,
    };
    let jobs = wants(
        &want.game,
        &documents,
        None,
        &basis,
        &dir.join("maps"),
        &SharedSettings::new(policy),
        &Control::default(),
    );
    assert_eq!(jobs.len(), 1);
    assert!(jobs[0].resolved);
    assert_eq!(jobs[0].profile.name, "Alice");
    assert_eq!(jobs[0].profile.dir, documents.join("profiles/Alice"));
    assert_eq!(jobs[0].dirs.len(), 2);
    assert!(jobs[0].profile.mods[0].files.is_some());
    assert!(jobs[0].profile.mods[0].problem.is_some());
    assert!(jobs[0].names.values().any(|name| name == "Alice"));
    assert!(jobs[0].names.values().any(|name| name == "Bob"));
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn settings_upgrade_starts_disabled_and_choices_survive_serialization() {
    let mut settings: crate::settings::MapSettings =
        serde_json::from_value(serde_json::json!({"buildings":false,"roads":true,"fast":true})).unwrap();
    assert!(settings.maintenance.games.is_empty());
    assert!(settings.maintenance.profiles.is_empty());
    settings.maintenance.games.insert("ats".into(), false);
    settings.maintenance.profiles.insert("ats:profiles/a".into(), true);
    let restored: crate::settings::MapSettings =
        serde_json::from_value(serde_json::to_value(&settings).unwrap()).unwrap();
    assert_eq!(settings, restored);
    assert!(!restored.maintenance.enabled(Kind::Ats, "ats:profiles/a"));
    assert!(restored.maintenance.profiles["ats:profiles/a"]);
    assert!(restored.fast);
    assert!(!restored.buildings);
}
