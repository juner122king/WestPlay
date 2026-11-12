use std::path::PathBuf;
use westplay_mapdata::files::{GameFiles, Mount};

struct Temp(PathBuf);
impl Temp {
    fn new() -> Self {
        static N: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
        let p = std::env::temp_dir().join(format!(
            "westplay-dependencies-{}-{}",
            std::process::id(),
            N.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
        ));
        std::fs::create_dir_all(&p).unwrap();
        Self(p)
    }

    fn write(&self, path: &str, data: &[u8]) {
        let p = self.0.join(path);
        std::fs::create_dir_all(p.parent().unwrap()).unwrap();
        std::fs::write(p, data).unwrap();
    }

    fn files(&self) -> GameFiles {
        GameFiles::new(vec![Mount::Folder(self.0.clone())])
    }
}

impl Drop for Temp {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

#[test]
fn ignores_unread_content_but_detects_every_observed_file_change() {
    let t = Temp::new();
    t.write("map/a.base", b"roads");
    t.write("sound/a.ogg", b"sound");
    let files = t.files();
    files.track_dependencies();
    files.read("/map/a.base").unwrap();
    let deps = files.dependencies().unwrap();
    t.write("sound/a.ogg", b"a longer unrelated sound");
    assert!(t.files().verify_dependencies(&deps).unwrap());
    t.write("map/a.base", b"different roads");
    assert!(!t.files().verify_dependencies(&deps).unwrap());
}

#[test]
fn records_missing_files_directory_additions_and_deletions() {
    let t = Temp::new();
    t.write("map/a.base", b"a");
    let files = t.files();
    files.track_dependencies();
    files.read("map/missing.aux").unwrap();
    files.list("map").unwrap();
    files.dirs("map").unwrap();
    let deps = files.dependencies().unwrap();
    assert!(t.files().verify_dependencies(&deps).unwrap());
    t.write("map/missing.aux", b"new");
    assert!(!t.files().verify_dependencies(&deps).unwrap());
    std::fs::remove_file(t.0.join("map/missing.aux")).unwrap();
    assert!(t.files().verify_dependencies(&deps).unwrap());
    t.write("map/sub/item", b"new directory");
    assert!(!t.files().verify_dependencies(&deps).unwrap());
    std::fs::remove_dir_all(t.0.join("map/sub")).unwrap();
    std::fs::remove_file(t.0.join("map/a.base")).unwrap();
    assert!(!t.files().verify_dependencies(&deps).unwrap());
}

#[test]
fn compares_effective_contents_across_mount_order_and_repackaging() {
    let a = Temp::new();
    let b = Temp::new();
    a.write("def/city.sii", b"city");
    b.write("def/city.sii", b"city");
    let stack = |reverse| {
        GameFiles::new(if reverse {
            vec![Mount::Folder(b.0.clone()), Mount::Folder(a.0.clone())]
        } else {
            vec![Mount::Folder(a.0.clone()), Mount::Folder(b.0.clone())]
        })
    };
    let files = stack(false);
    files.track_dependencies();
    files.read("def/city.sii").unwrap();
    let deps = files.dependencies().unwrap();
    assert!(stack(true).verify_dependencies(&deps).unwrap());
    a.write("def/city.sii", b"other city");
    assert!(!stack(true).verify_dependencies(&deps).unwrap());
    assert!(stack(false).verify_dependencies(&deps).unwrap());
}

#[test]
fn texture_pixels_and_dimensions_are_dependencies() {
    let t = Temp::new();
    let mut dds = vec![0u8; 132];
    dds[..4].copy_from_slice(b"DDS ");
    for (at, v) in [(12, 1u32), (16, 1), (88, 32), (92, 255)] {
        dds[at..at + 4].copy_from_slice(&v.to_le_bytes());
    }
    dds[128..].copy_from_slice(&[1, 2, 3, 255]);
    t.write("material/sign.dds", &dds);
    let files = t.files();
    files.track_dependencies();
    assert!(files.read_texture("material/sign.tobj").unwrap().is_some());
    let deps = files.dependencies().unwrap();
    assert!(t.files().verify_dependencies(&deps).unwrap());
    dds[128] = 4;
    t.write("material/sign.dds", &dds);
    assert!(!t.files().verify_dependencies(&deps).unwrap());
}

#[test]
fn rejects_unknown_schema_and_observations_that_changed_during_build() {
    let t = Temp::new();
    t.write("a", b"first");
    let f = t.files();
    f.track_dependencies();
    f.read("a").unwrap();
    t.write("a", b"second");
    f.read("a").unwrap();
    let mut deps = f.dependencies().unwrap();
    assert!(!deps.stable);
    assert!(!t.files().verify_dependencies(&deps).unwrap());
    deps.stable = true;
    deps.version = 999;
    assert!(!t.files().verify_dependencies(&deps).unwrap());
}

#[test]
fn cancellation_is_checked_between_dependency_queries() {
    let t = Temp::new();
    t.write("a", b"a");
    let f = t.files();
    f.track_dependencies();
    f.read("a").unwrap();
    let stop = std::sync::atomic::AtomicBool::new(true);
    assert!(t.files().verify_dependencies_cached(&f.dependencies().unwrap(), false, Some(&stop)).is_err());
}

fn build_zip(entries: &[(&str, &[u8], bool)]) -> Vec<u8> {
    use std::io::Write;
    let (mut data, mut directory) = (Vec::new(), Vec::new());
    for (path, contents, deflated) in entries {
        let stored = if *deflated {
            let mut encoder = flate2::write::DeflateEncoder::new(Vec::new(), flate2::Compression::default());
            encoder.write_all(contents).unwrap();
            encoder.finish().unwrap()
        } else {
            contents.to_vec()
        };
        let method: u16 = if *deflated { 8 } else { 0 };
        let local = data.len() as u32;
        data.extend(b"PK");
        data.extend([20u8, 0, 0, 0]);
        data.extend(method.to_le_bytes());
        data.extend([0u8; 8]);
        data.extend((stored.len() as u32).to_le_bytes());
        data.extend((contents.len() as u32).to_le_bytes());
        data.extend((path.len() as u16).to_le_bytes());
        data.extend(3u16.to_le_bytes());
        data.extend(path.as_bytes());
        data.extend(b"abc");
        data.extend(&stored);
        directory.extend(b"PK");
        directory.extend([20u8, 0, 20, 0, 0, 0]);
        directory.extend(method.to_le_bytes());
        directory.extend([0u8; 8]);
        directory.extend((stored.len() as u32).to_le_bytes());
        directory.extend((contents.len() as u32).to_le_bytes());
        directory.extend((path.len() as u16).to_le_bytes());
        directory.extend([0u8; 12]);
        directory.extend(local.to_le_bytes());
        directory.extend(path.as_bytes());
    }
    let offset = data.len() as u32;
    data.extend(&directory);
    data.extend(b"PK");
    data.extend([0u8; 4]);
    data.extend((entries.len() as u16).to_le_bytes());
    data.extend((entries.len() as u16).to_le_bytes());
    data.extend((directory.len() as u32).to_le_bytes());
    data.extend(offset.to_le_bytes());
    data.extend(0u16.to_le_bytes());
    data
}

#[test]
fn repackaging_does_not_rebuild_and_cached_reads_are_shared_between_profiles() {
    use westplay_mapdata::{archive::Archive, files::verification_totals};
    let t = Temp::new();
    let path = t.0.join("map.scs");
    std::fs::write(
        &path,
        build_zip(&[("map/roads.base", b"unchanged roads", false), ("sound/a.ogg", b"sound", false)]),
    )
    .unwrap();
    let mount = || Mount::Archive(Archive::open(&path).unwrap());
    let files = GameFiles::new(vec![mount()]);
    files.track_dependencies();
    files.read("map/roads.base").unwrap();
    files.list("map").unwrap();
    let deps = files.dependencies().unwrap();
    drop(files);
    // Reverse package order, compress it, and change an unrelated file.
    std::fs::write(
        &path,
        build_zip(&[("sound/a.ogg", b"unrelated new audio", true), ("map/roads.base", b"unchanged roads", true)]),
    )
    .unwrap();
    let started = std::time::Instant::now();
    let before = verification_totals();
    let before_bytes = westplay_mapdata::files::verification_bytes();
    assert!(GameFiles::new(vec![mount()]).verify_dependencies_cached(&deps, true, None).unwrap());
    let first = verification_totals();
    assert!(GameFiles::new(vec![mount()]).verify_dependencies_cached(&deps, true, None).unwrap());
    let second = verification_totals();
    assert!(second.1 > first.1);
    println!(
        "repack verification: {:?}, first reads={}, second reused={}, bytes read={}, full generations=0",
        started.elapsed(),
        first.0 - before.0,
        second.1 - first.1,
        westplay_mapdata::files::verification_bytes() - before_bytes
    );
    // The effective content still matters regardless of the compression method.
    std::fs::write(&path, build_zip(&[("map/roads.base", b"changed roads", true)])).unwrap();
    assert!(!GameFiles::new(vec![mount()]).verify_dependencies_cached(&deps, true, None).unwrap());
}

#[test]
fn tolerated_resource_errors_are_unverified_but_are_distinct_from_mixed_inputs() {
    let t = Temp::new();
    t.write("material/broken.dds", b"unsupported texture");
    let files = t.files();
    files.track_dependencies();
    assert!(files.read_texture("material/broken.tobj").is_err());
    let deps = files.dependencies().unwrap();
    assert!(deps.stable);
    assert!(deps.unreadable);
    assert!(!t.files().verify_dependencies(&deps).unwrap());
}
