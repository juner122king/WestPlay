//! WestPlay has one version, the workspace's (Cargo.toml), including its domestic.N suffix. The
//! places that must repeat it (Tauri's config, which writes it into the app's file details; the UI's package)
//! say the same, and the changelog has its release.

use std::path::Path;

const VERSION: &str = env!("CARGO_PKG_VERSION");

fn read(path: &str) -> String {
    std::fs::read_to_string(Path::new(env!("CARGO_MANIFEST_DIR")).join(path)).unwrap()
}

fn json_version(path: &str) -> String {
    let value: serde_json::Value = serde_json::from_str(&read(path)).unwrap();
    value["version"].as_str().unwrap_or_else(|| panic!("{path} has no version")).to_owned()
}

#[test]
fn every_place_says_the_workspaces_version() {
    assert_eq!(json_version("tauri.conf.json"), VERSION, "app/tauri.conf.json");
    assert_eq!(json_version("../ui/package.json"), VERSION, "ui/package.json");
    assert_eq!(json_version("../ui/package-lock.json"), VERSION, "ui/package-lock.json");
    let lock: serde_json::Value = serde_json::from_str(&read("../ui/package-lock.json")).unwrap();
    assert_eq!(lock["packages"][""]["version"], VERSION, "UI lockfile root package");
}

#[test]
fn the_changelog_has_this_version_or_whats_to_come() {
    let changelog = read("../CHANGELOG.md");
    let release = format!("\n## {VERSION} ");
    assert!(
        changelog.contains(&release) || changelog.contains("\n## Unreleased"),
        "CHANGELOG.md has neither `## {VERSION} (date)` nor `## Unreleased`"
    );
}

#[test]
fn the_domestic_version_is_accepted_by_tauris_config_and_has_a_revision() {
    let config: tauri::utils::config::Config = serde_json::from_str(&read("tauri.conf.json")).unwrap();
    assert_eq!(config.version.as_deref(), Some(VERSION));
    let (base, revision) = VERSION.split_once("-domestic.").expect("the domestic version identifier");
    assert_eq!(base, "2.3.0");
    assert!(revision.parse::<u32>().is_ok_and(|revision| revision > 0));
}
