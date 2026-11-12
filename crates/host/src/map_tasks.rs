//! Explicit requests, per-task cancellation and last-good cache references.

use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Cached {
    pub map: String,
    pub folder: String,
}

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(default)]
struct Saved {
    cancelled: BTreeMap<String, String>,
    caches: BTreeMap<String, Cached>,
}

#[derive(Clone, Debug)]
pub struct Task {
    pub id: String,
    pub key: String,
    pub input: String,
    pub targets: Vec<String>,
    pub stop: Arc<AtomicBool>,
    pub decision: PathBuf,
    pub finished: bool,
}

#[derive(Debug, Default)]
struct Inner {
    requests: BTreeMap<String, bool>,
    known: HashSet<String>,
    tasks: BTreeMap<String, Task>,
    active: Option<String>,
    saved: Saved,
    path: Option<PathBuf>,
}

#[derive(Debug, Default)]
pub struct Control {
    inner: Mutex<Inner>,
    generation: AtomicU64,
}

impl Control {
    pub fn load(&self, maps: &Path) {
        let mut inner = self.inner.lock().unwrap_or_else(|e| e.into_inner());
        let path = maps.join("preparation-state.json");
        inner.saved = std::fs::read(&path).ok().and_then(|v| serde_json::from_slice(&v).ok()).unwrap_or_default();
        inner.path = Some(path);
        // Decision files refer only to processes from the previous session. Persisted cancellation
        // signatures, not these transient arbitration files, prevent retry after restart.
        for entry in std::fs::read_dir(maps.join(".tasks")).into_iter().flatten().flatten() {
            if entry.file_type().is_ok_and(|kind| kind.is_file())
                && entry.path().extension().is_some_and(|ext| ext == "decision")
            {
                let _ = std::fs::remove_file(entry.path());
            }
        }
    }

    fn save(inner: &Inner) {
        if let Some(path) = &inner.path {
            let result = (|| -> std::io::Result<()> {
                if let Some(parent) = path.parent() {
                    std::fs::create_dir_all(parent)?;
                }
                let tmp = path.with_extension("json.partial");
                std::fs::write(&tmp, serde_json::to_vec(&inner.saved)?)?;
                std::fs::rename(tmp, path)
            })();
            if let Err(error) = result {
                log!("map preparation state couldn't be saved: {error}");
            }
        }
    }

    pub fn recheck(&self) {
        self.generation.fetch_add(1, Ordering::AcqRel);
    }

    pub fn generation(&self) -> u64 {
        self.generation.load(Ordering::Acquire)
    }

    pub fn known(&self, targets: impl Iterator<Item = String>) {
        self.inner.lock().unwrap_or_else(|e| e.into_inner()).known = targets.collect();
    }

    pub fn request(&self, targets: Vec<String>, force: bool) -> Result<(), String> {
        let mut inner = self.inner.lock().unwrap_or_else(|e| e.into_inner());
        if targets.is_empty() || targets.iter().any(|t| !inner.known.contains(t)) {
            return Err("Choose existing map targets explicitly".into());
        }
        for target in targets {
            inner.requests.entry(target).and_modify(|v| *v |= force).or_insert(force);
        }
        self.generation.fetch_add(1, Ordering::AcqRel);
        Ok(())
    }

    pub fn requested(&self, target: &str) -> bool {
        self.inner.lock().unwrap_or_else(|e| e.into_inner()).requests.contains_key(target)
    }

    pub fn mode(&self, targets: &[String]) -> Option<bool> {
        let inner = self.inner.lock().unwrap_or_else(|e| e.into_inner());
        targets.iter().filter_map(|t| inner.requests.get(t)).copied().reduce(|a, b| a || b)
    }

    pub fn consume(&self, targets: &[String]) {
        let mut inner = self.inner.lock().unwrap_or_else(|e| e.into_inner());
        let mut changed = false;
        for target in targets {
            changed |= inner.requests.remove(target).is_some();
        }
        if changed {
            self.generation.fetch_add(1, Ordering::AcqRel);
        }
    }

    pub fn has_cancelled(&self, key: &str) -> bool {
        self.inner.lock().unwrap_or_else(|e| e.into_inner()).saved.cancelled.contains_key(key)
    }

    pub fn cancelled(&self, key: &str, input: &str) -> bool {
        self.inner.lock().unwrap_or_else(|e| e.into_inner()).saved.cancelled.get(key).is_some_and(|v| v == input)
    }

    pub fn register(&self, key: &str, input: &str, targets: Vec<String>, maps: &Path) -> Task {
        static NEXT: AtomicU64 = AtomicU64::new(0);
        let mut inner = self.inner.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(task) = inner.tasks.get(key)
            && task.input == input
            && !task.finished
            && !task.stop.load(Ordering::Acquire)
        {
            return task.clone();
        }
        let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_nanos();
        let id = format!("{now:x}-{:x}", NEXT.fetch_add(1, Ordering::Relaxed));
        let task = Task {
            decision: maps.join(".tasks").join(format!("{id}.decision")),
            id,
            key: key.into(),
            input: input.into(),
            targets,
            stop: Arc::new(AtomicBool::new(false)),
            finished: false,
        };
        inner.tasks.insert(key.into(), task.clone());
        task
    }

    pub fn clear_cancel(&self, key: &str) {
        let mut inner = self.inner.lock().unwrap_or_else(|e| e.into_inner());
        if inner.saved.cancelled.remove(key).is_some() {
            Self::save(&inner);
        }
    }

    pub fn start(&self, task: &Task) -> std::io::Result<()> {
        if let Some(dir) = task.decision.parent() {
            std::fs::create_dir_all(dir)?;
        }
        self.inner.lock().unwrap_or_else(|e| e.into_inner()).active = Some(task.id.clone());
        Ok(())
    }

    pub fn cancel(&self, id: &str) -> Result<bool, String> {
        let mut inner = self.inner.lock().unwrap_or_else(|e| e.into_inner());
        let Some(task) = inner.tasks.values().find(|t| t.id == id && !t.finished).cloned() else { return Ok(false) };
        if let Some(dir) = task.decision.parent() {
            std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
        }
        match std::fs::OpenOptions::new().create_new(true).write(true).open(&task.decision) {
            Ok(mut file) => {
                use std::io::Write;
                file.write_all(b"cancel").map_err(|e| e.to_string())?;
            }
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => return Ok(false),
            Err(e) => return Err(e.to_string()),
        }
        task.stop.store(true, Ordering::Release);
        inner.saved.cancelled.insert(task.key.clone(), task.input.clone());
        for target in &task.targets {
            inner.requests.remove(target);
        }
        Self::save(&inner);
        self.generation.fetch_add(1, Ordering::AcqRel);
        Ok(true)
    }

    /// Drop queued tasks whose last automatic consumer was disabled (or whose input changed).
    pub fn retire_except(&self, keep: &HashSet<String>) {
        let mut inner = self.inner.lock().unwrap_or_else(|e| e.into_inner());
        let active = inner.active.clone();
        inner.tasks.retain(|_, task| {
            if active.as_deref() == Some(&task.id) || (keep.contains(&task.id) && !task.finished) {
                return true;
            }
            task.stop.store(true, Ordering::Release);
            let _ = std::fs::remove_file(&task.decision);
            false
        });
    }

    pub fn pending(&self, id: &str) -> bool {
        self.inner
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .tasks
            .values()
            .any(|task| task.id == id && !task.finished && !task.stop.load(Ordering::Acquire))
    }

    pub fn park(&self, task: &Task) {
        let mut inner = self.inner.lock().unwrap_or_else(|e| e.into_inner());
        if inner.active.as_deref() == Some(&task.id) {
            inner.active = None;
        }
    }

    pub fn finish(&self, task: &Task) {
        let mut inner = self.inner.lock().unwrap_or_else(|e| e.into_inner());
        if inner.active.as_deref() == Some(&task.id) {
            inner.active = None;
        }
        if let Some(t) = inner.tasks.get_mut(&task.key)
            && t.id == task.id
        {
            t.finished = true;
        }
        let _ = std::fs::remove_file(&task.decision);
    }

    pub fn remember(&self, targets: &[String], map: &str, folder: &Path) {
        let Some(folder) = folder.file_name().map(|v| v.to_string_lossy().into_owned()) else { return };
        let mut inner = self.inner.lock().unwrap_or_else(|e| e.into_inner());
        let cache = Cached { map: map.into(), folder };
        let mut changed = false;
        for target in targets {
            if inner.saved.caches.get(target) != Some(&cache) {
                inner.saved.caches.insert(target.clone(), cache.clone());
                changed = true;
            }
        }
        if changed {
            Self::save(&inner);
        }
    }

    pub fn cached(&self, targets: &[String], map: &str) -> Option<Cached> {
        let inner = self.inner.lock().unwrap_or_else(|e| e.into_inner());
        targets.iter().find_map(|target| inner.saved.caches.get(target).filter(|c| c.map == map).cloned())
    }

    pub fn pinned(&self) -> Vec<String> {
        self.inner.lock().unwrap_or_else(|e| e.into_inner()).saved.caches.values().map(|c| c.folder.clone()).collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn root() -> PathBuf {
        static N: AtomicU64 = AtomicU64::new(0);
        let p = std::env::temp_dir().join(format!(
            "westplay-task-{}-{}",
            std::process::id(),
            N.fetch_add(1, Ordering::Relaxed)
        ));
        std::fs::create_dir_all(&p).unwrap();
        p
    }
    #[test]
    fn explicit_targets_only_and_one_off_does_not_change_policy() {
        let c = Control::default();
        c.known(["ats:profile/a".to_owned()].into_iter());
        assert!(c.request(vec![], false).is_err());
        assert!(c.request(vec!["unknown".into()], false).is_err());
        c.request(vec!["ats:profile/a".into()], false).unwrap();
        assert_eq!(c.mode(&["ats:profile/a".into()]), Some(false));
        c.request(vec!["ats:profile/a".into()], true).unwrap();
        assert_eq!(c.mode(&["ats:profile/a".into()]), Some(true));
        c.consume(&["ats:profile/a".into()]);
        assert!(!c.requested("ats:profile/a"));
    }
    #[test]
    fn cancelled_inputs_survive_restart_and_new_tasks_have_new_ids() {
        let p = root();
        let c = Control::default();
        c.load(&p);
        let first = c.register("job", "inputs", vec!["ats:profile/a".into()], &p);
        c.start(&first).unwrap();
        assert!(c.cancel(&first.id).unwrap());
        assert!(first.stop.load(Ordering::Acquire));
        c.finish(&first);
        let restored = Control::default();
        restored.load(&p);
        assert!(restored.cancelled("job", "inputs"));
        assert!(!restored.cancelled("job", "changed"));
        let next = c.register("job", "inputs", vec!["ats:profile/a".into()], &p);
        assert_ne!(first.id, next.id);
        assert!(!c.cancel(&first.id).unwrap());
        assert!(!next.stop.load(Ordering::Acquire));
        c.clear_cancel("job");
        assert!(!c.cancelled("job", "inputs"));
        let _ = std::fs::remove_dir_all(p);
    }
    #[test]
    fn publication_and_cancel_have_exactly_one_winner() {
        let p = root();
        let c = Control::default();
        c.load(&p);
        for n in 0..20 {
            let task = c.register(&format!("job-{n}"), "inputs", vec![], &p);
            c.start(&task).unwrap();
            let barrier = std::sync::Barrier::new(2);
            let (committed, cancelled) = std::thread::scope(|scope| {
                let publish = scope.spawn(|| {
                    barrier.wait();
                    std::fs::OpenOptions::new().write(true).create_new(true).open(&task.decision).is_ok()
                });
                barrier.wait();
                let cancelled = c.cancel(&task.id).unwrap();
                (publish.join().unwrap(), cancelled)
            });
            assert_ne!(committed, cancelled);
            assert_eq!(task.stop.load(Ordering::Acquire), cancelled);
            c.finish(&task);
        }
        let _ = std::fs::remove_dir_all(p);
    }
    #[test]
    fn last_good_cache_never_crosses_map_or_game() {
        let p = root();
        let c = Control::default();
        c.load(&p);
        c.remember(&["ets2:p".into()], "europe", &p.join("europe-0123456789abcdef"));
        assert!(c.cached(&["ets2:p".into()], "europe").is_some());
        assert!(c.cached(&["ats:p".into()], "europe").is_none());
        assert!(c.cached(&["ets2:p".into()], "standalone").is_none());
        assert_eq!(c.pinned(), vec!["europe-0123456789abcdef"]);
        let _ = std::fs::remove_dir_all(p);
    }
    #[test]
    fn retiring_queued_work_cleans_its_decision_but_preserves_cancellation() {
        let p = root();
        let c = Control::default();
        c.load(&p);
        let task = c.register("queued", "inputs", vec![], &p);
        assert!(c.cancel(&task.id).unwrap());
        assert!(task.decision.exists());
        c.retire_except(&HashSet::new());
        assert!(!task.decision.exists());
        assert!(c.cancelled("queued", "inputs"));
        assert!(!c.cancel(&task.id).unwrap());
        let _ = std::fs::remove_dir_all(p);
    }
}
