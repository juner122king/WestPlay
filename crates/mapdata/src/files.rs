//! The game's file system: archives mounted on top of each other, a later one's files replacing an
//! earlier one's at the same path (the base game first, then its DLCs, then mods). Each is the game's
//! own `.scs` archive ([`crate::archive`]), or a folder extracted from one (for development).

use std::collections::BTreeSet;
use std::fmt;
use std::path::{Path, PathBuf};

use crate::archive::{Archive, ArchiveError};
use crate::texture::Texture;
use std::sync::atomic::{AtomicU64, Ordering};
static VERIFIED_READS: AtomicU64 = AtomicU64::new(0);
static VERIFIED_BYTES: AtomicU64 = AtomicU64::new(0);
pub fn verification_bytes() -> u64 {
    VERIFIED_BYTES.load(Ordering::Relaxed)
}
static VERIFIED_HITS: AtomicU64 = AtomicU64::new(0);
pub fn verification_totals() -> (u64, u64) {
    (VERIFIED_READS.load(Ordering::Relaxed), VERIFIED_HITS.load(Ordering::Relaxed))
}

/// One mounted archive.
pub enum Mount {
    Archive(Archive),
    Folder(PathBuf),
}

impl Mount {
    fn name(&self) -> &Path {
        match self {
            Self::Archive(archive) => archive.path(),
            Self::Folder(path) => path,
        }
    }
}

/// A path that couldn't be read from a mount (or, with no path, a mount that couldn't be opened).
#[derive(Debug)]
pub struct FileError {
    pub path: String,
    pub mount: PathBuf,
    pub error: ArchiveError,
}

impl fmt::Display for FileError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        // No path: the mount itself couldn't be opened.
        if self.path.is_empty() {
            write!(f, "{}: {}", self.mount.display(), self.error)
        } else {
            write!(f, "{} in {}: {}", self.path, self.mount.display(), self.error)
        }
    }
}

impl std::error::Error for FileError {}

/// The base game's archives, in the order they're mounted; DLCs follow ([`GameFiles::install`]). Its trucks'
/// interiors and screens (`base_vehicle`) and its default settings (`base_cfg`) included.
pub const BASE_ARCHIVES: [&str; 8] =
    ["base", "base_map", "base_share", "base_vehicle", "base_cfg", "core", "def", "locale"];

pub struct GameFiles {
    /// Earliest first.
    mounts: Vec<Mount>,
    recorder: crate::dependencies::Recorder,
    initial_stamp: std::sync::Mutex<Option<String>>,
}

impl GameFiles {
    /// `mounts` in mount order: a file in a later one replaces the same path in an earlier one.
    pub fn new(mounts: Vec<Mount>) -> Self {
        Self { mounts, recorder: Default::default(), initial_stamp: Default::default() }
    }

    /// The game as installed in `dir` (the folder with `base.scs`): the base game's archives, then
    /// every DLC's (`dlc_*.scs`), alphabetically. (Which DLCs the player owns is still to be checked:
    /// Steam keeps only those, but other stores may differ.)
    pub fn install(dir: &Path) -> Result<Self, FileError> {
        Self::mounted(dir, ".scs", |path| {
            Archive::open(path).map(Mount::Archive).map_err(|error| FileError {
                path: String::new(),
                mount: path.to_owned(),
                error,
            })
        })
    }

    /// The game in `dir`: its archives if it has them (the install folder, with `base.scs`), otherwise
    /// folders extracted from them ([`Self::extracted`]).
    pub fn open(dir: &Path) -> Result<Self, FileError> {
        if dir.join("base.scs").is_file() { Self::install(dir) } else { Self::extracted(dir) }
    }

    /// The same, from archives extracted into folders named after them (`base/`, `dlc_fr/`…), for
    /// development. A missing base archive's folder is skipped.
    pub fn extracted(dir: &Path) -> Result<Self, FileError> {
        Self::mounted(dir, "", |path| Ok(Mount::Folder(path.to_owned())))
    }

    fn mounted(
        dir: &Path,
        extension: &str,
        mount: impl Fn(&Path) -> Result<Mount, FileError>,
    ) -> Result<Self, FileError> {
        let io_error = |error| FileError { path: String::new(), mount: dir.to_owned(), error: ArchiveError::Io(error) };
        let mut dlcs: Vec<PathBuf> = std::fs::read_dir(dir)
            .map_err(io_error)?
            .flatten()
            .map(|entry| entry.path())
            .filter(|path| {
                let Some(name) = path.file_name().and_then(|name| name.to_str()) else { return false };
                let kind = if extension.is_empty() { path.is_dir() } else { path.is_file() };
                name.starts_with("dlc_") && name.ends_with(extension) && kind
            })
            .collect();
        dlcs.sort();
        let base = BASE_ARCHIVES.iter().map(|name| dir.join(format!("{name}{extension}"))).filter(|path| path.exists());
        let mounts = base.chain(dlcs).map(|path| mount(&path)).collect::<Result<_, _>>()?;
        Ok(Self::new(mounts))
    }

    pub fn mounts(&self) -> &[Mount] {
        &self.mounts
    }

    /// Enables dependency capture only for map generation.
    pub fn track_dependencies(&self) {
        self.recorder.start();
        *self.initial_stamp.lock().unwrap_or_else(|e| e.into_inner()) = Some(self.input_stamp());
    }
    pub fn input_stamp(&self) -> String {
        crate::dependencies::input_stamp(&self.mounts.iter().map(|m| m.name().to_path_buf()).collect::<Vec<_>>())
    }
    pub fn inputs_unchanged(&self) -> bool {
        self.mounts.iter().all(|m| match m {
            Mount::Archive(a) => a.unchanged(),
            _ => true,
        }) && self
            .initial_stamp
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .as_ref()
            .is_none_or(|stamp| *stamp == self.input_stamp())
    }
    pub fn dependencies(&self) -> Option<crate::dependencies::Dependencies> {
        self.recorder.snapshot()
    }

    fn observed<T>(
        &self,
        op: &str,
        path: &str,
        value: Result<T, FileError>,
        hash: impl FnOnce(&T) -> String,
    ) -> Result<T, FileError> {
        if self.recorder.enabled() {
            let digest = match &value {
                Ok(value) => hash(value),
                Err(error) => format!("error:{}", error.error),
            };
            self.recorder.record(op, path, digest);
        }
        value
    }
    pub fn read(&self, path: &str) -> Result<Option<Vec<u8>>, FileError> {
        self.observed("read", path, self.read_untracked(path), |v| crate::dependencies::optional_digest(v.as_deref()))
    }
    pub fn read_texture(&self, path: &str) -> Result<Option<Texture>, FileError> {
        self.observed("texture", path, self.read_texture_untracked(path), |v| match v {
            None => "missing".into(),
            Some(t) => {
                let mut bytes = Vec::with_capacity(t.rgba.len() + 8);
                bytes.extend(t.width.to_le_bytes());
                bytes.extend(t.height.to_le_bytes());
                bytes.extend(&t.rgba);
                crate::dependencies::optional_digest(Some(&bytes))
            }
        })
    }
    pub fn read_texture_top(&self, path: &str) -> Result<Option<crate::archive::RawTexture>, FileError> {
        self.observed("textureTop", path, self.read_texture_top_untracked(path), |v| match v {
            None => "missing".into(),
            Some(t) => {
                let mut bytes = Vec::with_capacity(t.data.len() + 24);
                bytes.extend(t.width.to_le_bytes());
                bytes.extend(t.height.to_le_bytes());
                bytes.extend(t.format.to_le_bytes());
                bytes.extend((t.row_alignment as u64).to_le_bytes());
                bytes.extend(&t.data);
                crate::dependencies::optional_digest(Some(&bytes))
            }
        })
    }
    pub fn list(&self, path: &str) -> Result<Vec<String>, FileError> {
        self.observed("list", path, self.list_untracked(path), |v| {
            crate::dependencies::digest(&serde_json::to_vec(v).unwrap())
        })
    }
    pub fn dirs(&self, path: &str) -> Result<Vec<String>, FileError> {
        self.observed("dirs", path, self.dirs_untracked(path), |v| {
            crate::dependencies::digest(&serde_json::to_vec(v).unwrap())
        })
    }
    /// Replay queries so new overrides, directories and previously missing files count too.
    pub fn verify_dependencies(&self, expected: &crate::dependencies::Dependencies) -> Result<bool, FileError> {
        self.verify_dependencies_cached(expected, false, None)
    }
    pub fn verify_dependencies_cached(
        &self,
        expected: &crate::dependencies::Dependencies,
        allow_cache: bool,
        stop: Option<&std::sync::atomic::AtomicBool>,
    ) -> Result<bool, FileError> {
        use std::collections::HashMap;
        use std::sync::{Mutex, OnceLock};
        static CACHE: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();
        let cache = CACHE.get_or_init(Default::default);
        if expected.version != crate::dependencies::VERSION
            || !expected.stable
            || expected.unreadable
            || expected.queries.is_empty()
        {
            return Ok(false);
        }
        self.track_dependencies();
        let stack_stamp = self.input_stamp();
        for key in expected.queries.keys() {
            if stop.is_some_and(|s| s.load(std::sync::atomic::Ordering::Acquire)) {
                return Err(FileError {
                    path: String::new(),
                    mount: PathBuf::new(),
                    error: ArchiveError::Io(std::io::Error::new(std::io::ErrorKind::Interrupted, "cancelled")),
                });
            }
            let Some((op, path)) = key.split_once(':') else { return Ok(false) };
            // Reads from the same source are shared even when two profiles have different other mods.
            let identity = if op == "read" {
                self.source(path)
                    .map(|source| {
                        let input = if source.is_dir() { source.join(path) } else { source.to_path_buf() };
                        format!("{}:{}", source.to_string_lossy(), crate::dependencies::input_stamp(&[input]))
                    })
                    .unwrap_or_else(|| stack_stamp.clone())
            } else {
                stack_stamp.clone()
            };
            let cache_key = format!("{identity}:{key}");
            let cached = if allow_cache {
                cache.lock().unwrap_or_else(|e| e.into_inner()).get(&cache_key).cloned()
            } else {
                None
            };
            if let Some(value) = cached {
                VERIFIED_HITS.fetch_add(1, Ordering::Relaxed);
                self.recorder.record(op, path, value);
                continue;
            }
            VERIFIED_READS.fetch_add(1, Ordering::Relaxed);
            let bytes = match op {
                "read" => self.read(path)?.map_or(0, |v| v.len()),
                "texture" => self.read_texture(path)?.map_or(0, |v| v.rgba.len()),
                "textureTop" => self.read_texture_top(path)?.map_or(0, |v| v.data.len()),
                "list" => self.list(path)?.iter().map(|v| v.len()).sum(),
                "dirs" => self.dirs(path)?.iter().map(|v| v.len()).sum(),
                _ => return Ok(false),
            };
            VERIFIED_BYTES.fetch_add(bytes as u64, Ordering::Relaxed);
            if let Some(value) = self.recorder.value(key) {
                let mut cache = cache.lock().unwrap_or_else(|e| e.into_inner());
                if cache.len() >= 200_000 {
                    cache.clear();
                }
                cache.insert(cache_key, value);
            }
        }
        Ok(self.dependencies().as_ref() == Some(expected) && self.inputs_unchanged())
    }

    /// Where a game path is read from (the latest mount that has it: an archive's path, or a folder's), so a
    /// file that can't be understood names the mod it came from.
    pub fn source(&self, path: &str) -> Option<&Path> {
        let has = |mount: &&Mount| match mount {
            Mount::Archive(archive) => archive.contains_file(path),
            Mount::Folder(root) => root.join(path.trim_start_matches('/')).is_file(),
        };
        self.mounts.iter().rev().find(has).map(Mount::name)
    }

    /// Mounts `mount` over everything mounted so far (a mod: its files replace the same paths below it).
    pub fn mount(&mut self, mount: Mount) {
        self.mounts.push(mount);
    }

    /// Reads a game path such as `/def/world/road_look.sii` (leading slash optional): from the latest
    /// mount that has it, `None` if none does.
    fn read_untracked(&self, path: &str) -> Result<Option<Vec<u8>>, FileError> {
        for mount in self.mounts.iter().rev() {
            let read = match mount {
                Mount::Archive(archive) => archive.read(path),
                Mount::Folder(root) => match std::fs::read(root.join(path.trim_start_matches('/'))) {
                    Ok(bytes) => Ok(Some(bytes)),
                    Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
                    // A folder at the path: no file there.
                    Err(_) if root.join(path.trim_start_matches('/')).is_dir() => Ok(None),
                    Err(error) => Err(ArchiveError::Io(error)),
                },
            };
            match read {
                Ok(Some(bytes)) => return Ok(Some(bytes)),
                Ok(None) => {}
                Err(error) => return Err(file_error(path, mount, error)),
            }
        }
        Ok(None)
    }

    /// A texture's top level as stored ([`crate::archive::Archive::read_texture_top`]), from the latest archive
    /// that has it (not from extracted folders: there, the `.dds` beside the `.tobj` is the picture).
    fn read_texture_top_untracked(&self, path: &str) -> Result<Option<crate::archive::RawTexture>, FileError> {
        for mount in self.mounts.iter().rev() {
            if let Mount::Archive(archive) = mount
                && archive.contains(path)
            {
                return archive.read_texture_top(path).map_err(|error| file_error(path, mount, error));
            }
        }
        Ok(None)
    }

    /// Reads a texture (a `.tobj` path) from the latest mount that has it: from an archive's texture entry,
    /// or in an extracted folder from the `.dds` file beside its `.tobj`.
    fn read_texture_untracked(&self, path: &str) -> Result<Option<Texture>, FileError> {
        for mount in self.mounts.iter().rev() {
            let read = match mount {
                Mount::Archive(archive) if archive.contains(path) => archive.read_texture(path),
                Mount::Archive(_) => Ok(None),
                Mount::Folder(root) => {
                    let dds = root.join(path.trim_start_matches('/')).with_extension("dds");
                    match std::fs::read(&dds) {
                        Ok(bytes) => Texture::from_dds(&bytes)
                            .map(Some)
                            .map_err(|what| ArchiveError::Unsupported { hash: 0, what }),
                        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
                        Err(error) => Err(ArchiveError::Io(error)),
                    }
                }
            };
            match read {
                Ok(Some(texture)) => return Ok(Some(texture)),
                Ok(None) => {}
                Err(error) => return Err(file_error(path, mount, error)),
            }
        }
        Ok(None)
    }

    /// The names of the files directly in a game directory, across all mounts, sorted.
    fn list_untracked(&self, dir: &str) -> Result<Vec<String>, FileError> {
        self.names(dir, false)
    }

    /// The names of the directories directly in a game directory, across all mounts, sorted.
    fn dirs_untracked(&self, dir: &str) -> Result<Vec<String>, FileError> {
        self.names(dir, true)
    }

    fn names(&self, dir: &str, dirs: bool) -> Result<Vec<String>, FileError> {
        let mut names = BTreeSet::new();
        for mount in &self.mounts {
            match mount {
                Mount::Archive(archive) => {
                    let listing = archive.list(dir).map_err(|error| file_error(dir, mount, error))?;
                    names.extend(
                        listing.into_iter().flat_map(|listing| if dirs { listing.dirs } else { listing.files }),
                    );
                }
                Mount::Folder(root) => {
                    let entries = match std::fs::read_dir(root.join(dir.trim_start_matches('/'))) {
                        Ok(entries) => entries,
                        Err(error) if error.kind() == std::io::ErrorKind::NotFound => continue,
                        Err(error) => return Err(file_error(dir, mount, ArchiveError::Io(error))),
                    };
                    for entry in entries {
                        let entry = entry.map_err(|error| file_error(dir, mount, ArchiveError::Io(error)))?;
                        let kind = entry.metadata().map_err(|error| file_error(dir, mount, ArchiveError::Io(error)))?;
                        if if dirs { kind.is_dir() } else { kind.is_file() } {
                            names.insert(entry.file_name().to_string_lossy().into_owned());
                        }
                    }
                }
            }
        }
        Ok(names.into_iter().collect())
    }
}

fn file_error(path: &str, mount: &Mount, error: ArchiveError) -> FileError {
    FileError { path: path.to_owned(), mount: mount.name().to_owned(), error }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_dir::TempDir;

    #[test]
    fn names_the_mount_a_path_is_read_from() {
        let (game, a_mod) = (TempDir::new(), TempDir::new());
        for (root, file) in
            [(&game.path, "map/europe/sec+0011+0001.base"), (&a_mod.path, "map/europe/sec+0011+0001.base")]
        {
            std::fs::create_dir_all(root.join("map/europe")).unwrap();
            std::fs::write(root.join(file), b"sector").unwrap();
        }
        std::fs::write(game.path.join("map/europe/sec+0000+0000.base"), b"sector").unwrap();
        let files = GameFiles::new(vec![Mount::Folder(game.path.clone()), Mount::Folder(a_mod.path.clone())]);
        // The mod's own sector comes from the mod; the one it leaves alone, from the game.
        assert_eq!(files.source("/map/europe/sec+0011+0001.base"), Some(a_mod.path.as_path()));
        assert_eq!(files.source("map/europe/sec+0000+0000.base"), Some(game.path.as_path()));
        assert_eq!(files.source("map/europe/sec+0099+0099.base"), None);
    }
}
