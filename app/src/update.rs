//! Domestic edition update policy. Upstream installers would replace domestic integrations.
//! Keep the command names for existing clients, but never create an updater, start a watcher,
//! contact a release source, or install an online update. Manual NSIS upgrades remain supported.

use serde::Serialize;

/// The wire format retained for clients of the original update commands.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Offer {
    version: String,
    notes: String,
    date: Option<String>,
}

/// Fail closed in both debug and release builds, irrespective of saved settings.
#[tauri::command]
pub fn online_updates_enabled() -> bool {
    false
}

#[tauri::command]
pub fn update_offer() -> Option<Offer> {
    None
}

#[tauri::command]
pub fn look_for_update() -> Option<Offer> {
    None
}

#[tauri::command]
pub fn install_update() -> Result<(), String> {
    Err("定制版暂不支持在线更新，请手动安装升级".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn domestic_updates_are_disabled_even_for_direct_command_calls() {
        assert!(!online_updates_enabled());
        assert!(update_offer().is_none());
        assert!(look_for_update().is_none());
        assert_eq!(install_update().unwrap_err(), "定制版暂不支持在线更新，请手动安装升级");
    }
}
