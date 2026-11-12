//! Content observations of the virtual filesystem, independent of archive packaging.

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::sync::Mutex;

pub const VERSION: u32 = 1;

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct Dependencies {
    pub version: u32,
    pub queries: BTreeMap<String, String>,
    pub stable: bool,
    /// Optional reads failed: the resulting map is usable but cannot be certified current.
    #[serde(default)]
    pub unreadable: bool,
}

#[derive(Default)]
pub struct Recorder(Mutex<Option<Dependencies>>);

impl Recorder {
    pub fn start(&self) {
        *self.0.lock().unwrap_or_else(|e| e.into_inner()) =
            Some(Dependencies { version: VERSION, queries: BTreeMap::new(), stable: true, unreadable: false });
    }

    pub fn record(&self, operation: &str, path: &str, value: String) {
        let mut state = self.0.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(deps) = state.as_mut() {
            let key = format!("{operation}:{}", path.trim_start_matches('/'));
            if value.starts_with("error:") {
                deps.unreadable = true;
            }
            if let Some(previous) = deps.queries.insert(key, value.clone())
                && previous != value
            {
                deps.stable = false;
            }
        }
    }

    pub fn value(&self, key: &str) -> Option<String> {
        self.0.lock().unwrap_or_else(|e| e.into_inner()).as_ref().and_then(|s| s.queries.get(key).cloned())
    }

    pub fn enabled(&self) -> bool {
        self.0.lock().unwrap_or_else(|e| e.into_inner()).is_some()
    }

    pub fn snapshot(&self) -> Option<Dependencies> {
        self.0.lock().unwrap_or_else(|e| e.into_inner()).clone()
    }
}

pub fn digest(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

pub fn optional_digest(bytes: Option<&[u8]>) -> String {
    bytes.map_or_else(|| "missing".into(), |bytes| format!("sha256:{}", digest(bytes)))
}

/// Metadata is a fast invalidation hint, never the persisted content identity.
pub fn input_stamp(paths: &[std::path::PathBuf]) -> String {
    fn visit(
        path: &std::path::Path,
        entries: &mut Vec<String>,
        visiting: &mut std::collections::HashSet<std::path::PathBuf>,
    ) {
        match std::fs::metadata(path) {
            Ok(m) => {
                let at =
                    m.modified().ok().and_then(|v| v.duration_since(std::time::UNIX_EPOCH).ok()).map(|v| v.as_nanos());
                entries.push(format!("{}:{}:{at:?}:{}", path.to_string_lossy(), m.len(), m.is_dir()));
                if m.is_dir() {
                    // The virtual filesystem follows folder-mod links too. Include their targets,
                    // but stop cycles so a junction cannot make metadata discovery recurse forever.
                    let real = std::fs::canonicalize(path).unwrap_or_else(|_| path.to_owned());
                    if !visiting.insert(real.clone()) {
                        entries.push("directory-cycle".into());
                        return;
                    }
                    match std::fs::read_dir(path) {
                        Ok(children) => {
                            let mut children: Vec<_> = children
                                .filter_map(|child| match child {
                                    Ok(child) => Some(child),
                                    Err(error) => {
                                        entries.push(format!("directory-entry-error:{:?}", error.kind()));
                                        None
                                    }
                                })
                                .collect();
                            children.sort_by_key(|child| child.path());
                            for child in children {
                                visit(&child.path(), entries, visiting);
                            }
                        }
                        Err(error) => entries.push(format!("directory-error:{:?}", error.kind())),
                    }
                    visiting.remove(&real);
                }
            }
            Err(e) => entries.push(format!("{}:error:{:?}", path.to_string_lossy(), e.kind())),
        }
    }
    let mut entries = Vec::new();
    let mut visiting = std::collections::HashSet::new();
    for path in paths {
        visit(path, &mut entries, &mut visiting);
    }
    digest(entries.join("\n").as_bytes())
}
