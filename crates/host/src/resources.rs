//! Page lifetimes, independent of WebView2 so deadlines and playback protection are testable.
use serde_json::{Value, json};
use std::collections::HashMap;
use std::time::{Duration, Instant};

pub const IDLE: Duration = Duration::from_secs(30);
const REQUEST_TIMEOUT: Duration = Duration::from_secs(20);

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub enum App {
    Youtube,
    AppleMusic,
    Bilibili,
    Ximalaya,
    Douyin,
    Hongguo,
    Netease,
    Player,
}

impl App {
    pub const ALL: [Self; 8] = [
        Self::Youtube,
        Self::AppleMusic,
        Self::Bilibili,
        Self::Ximalaya,
        Self::Douyin,
        Self::Hongguo,
        Self::Netease,
        Self::Player,
    ];
    pub fn name(self) -> &'static str {
        match self {
            Self::Youtube => "youtube",
            Self::AppleMusic => "appleMusic",
            Self::Bilibili => "bilibili",
            Self::Ximalaya => "ximalaya",
            Self::Douyin => "douyin",
            Self::Hongguo => "hongguo",
            Self::Netease => "netease",
            Self::Player => "player",
        }
    }
    fn from_message(kind: &str) -> Option<Self> {
        Self::ALL.into_iter().find(|app| {
            let name = app.name();
            kind == name
                || kind
                    .strip_prefix(name)
                    .is_some_and(|suffix| matches!(suffix, "Answer" | "Playback" | "Account" | "SignIn"))
        })
    }
}

#[derive(Default)]
struct Page {
    generation: u64,
    resident: bool,
    foreground: bool,
    resume_pending: bool,
    signing_in: bool,
    playing: bool,
    ready: bool,
    opened: Option<Instant>,
    playing_requested: Option<Instant>,
    idle_since: Option<Instant>,
    pending: HashMap<u64, Instant>,
}

impl Page {
    fn reason(&self, now: Instant) -> Option<&'static str> {
        if self.foreground {
            Some("foreground")
        } else if self.playing {
            Some("playing")
        } else if self.resume_pending {
            Some("resume pending")
        } else if self.signing_in {
            Some("signing in")
        } else if !self.pending.is_empty() {
            Some("requests")
        } else if self.playing_requested.is_some_and(|at| now.duration_since(at) < REQUEST_TIMEOUT) {
            Some("starting playback")
        } else if !self.ready && self.opened.is_some_and(|at| now.duration_since(at) < REQUEST_TIMEOUT) {
            Some("loading")
        } else {
            None
        }
    }
}

#[derive(Default)]
pub struct Resources {
    pages: HashMap<App, Page>,
    pub map_resident: bool,
}

impl Resources {
    /// `None` fields leave the other activity intact (navigation and automatic resume report independently).
    pub fn activity(&mut self, app: App, foreground: Option<bool>, resume_pending: Option<bool>) {
        let page = self.pages.entry(app).or_default();
        if let Some(value) = foreground {
            page.foreground = value;
        }
        if let Some(value) = resume_pending {
            page.resume_pending = value;
        }
        if page.foreground || page.resume_pending {
            page.idle_since = None;
        }
    }

    pub fn reset_activity(&mut self) {
        self.map_resident = false;
        for page in self.pages.values_mut() {
            page.foreground = false;
            page.resume_pending = false;
        }
    }

    /// Passive updates never create an absent browser. Replies are bounded by the UI's existing timeout.
    pub fn command(&mut self, message: &Value, now: Instant) -> bool {
        let Some(app) = message["type"].as_str().and_then(App::from_message) else { return true };
        let Some(action) = message["command"]["action"].as_str() else { return true };
        let page = self.pages.entry(app).or_default();
        if message["generation"].as_u64().is_some_and(|id| id != page.generation) {
            return false;
        }
        let starts = matches!(
            action,
            "start"
                | "signIn"
                | "signOut"
                | "ask"
                | "load"
                | "play"
                | "search"
                | "suggest"
                | "related"
                | "feed"
                | "channel"
                | "subscribe"
                | "playlist"
        ) || (action == "language" && page.foreground);
        if !page.resident && !starts {
            return false;
        }
        if !matches!(action, "hide" | "volume" | "crop" | "language" | "spectrum") {
            page.idle_since = None;
        }
        if let Some(id) = message["command"]["id"].as_u64() {
            page.pending.insert(id, now);
        }
        if matches!(action, "load" | "play" | "next" | "previous" | "selectEpisode") {
            page.ready = false;
            page.opened = Some(now);
            page.playing_requested = Some(now);
        } else if matches!(action, "pause" | "stop" | "close" | "signOut") {
            page.playing_requested = None;
        }
        true
    }

    /// Called before consuming reports; controllers and their queued reports belong to this generation.
    pub fn sync(&mut self, app: App, resident: bool, signing_in: bool, now: Instant) -> Option<Value> {
        let page = self.pages.entry(app).or_default();
        page.signing_in = signing_in;
        if signing_in {
            page.idle_since = None;
        }
        if page.resident == resident {
            return None;
        }
        page.resident = resident;
        page.idle_since = None;
        page.playing = false;
        page.ready = false;
        if resident {
            page.generation += 1;
            page.opened = Some(now);
            crate::log!("[resources] {} created: generation {}", app.name(), page.generation);
        } else {
            page.opened = None;
            page.playing_requested = None;
            page.pending.clear();
            page.resume_pending = false;
            crate::log!("[resources] {} closed: generation {}", app.name(), page.generation);
        }
        Some(json!({"type":"mediaResource", "app":app, "generation":page.generation, "resident":resident}))
    }

    /// Attach an instance id and derive host-side playback and request protection from actual reports.
    pub fn report(&mut self, message: &mut Value, now: Instant) {
        let Some(kind) = message["type"].as_str().map(str::to_owned) else { return };
        let Some(app) = App::from_message(&kind) else { return };
        let page = self.pages.entry(app).or_default();
        message["generation"] = page.generation.into();
        if kind.ends_with("Answer") {
            if let Some(id) = message["id"].as_u64() {
                page.pending.remove(&id);
            }
        } else if kind == "youtube" {
            if !message["state"].is_null() {
                page.playing = matches!(message["state"]["state"].as_i64(), Some(1 | 3));
                page.ready = true;
            }
        } else if kind == app.name() {
            if let Some(playing) = message["playing"].as_bool() {
                page.playing = playing;
                page.ready = true;
            }
        } else if kind.ends_with("Playback") {
            let playback = &message["playback"];
            page.playing =
                playback["playing"].as_bool().unwrap_or(false) || playback["status"].as_str() == Some("playing");
            if !playback.is_null() {
                page.ready = true;
            }
        }
        if page.ready
            && let Some(opened) = page.opened.take()
        {
            crate::log!(
                "[resources] {} ready in {} ms; generation {}; pending {}",
                app.name(),
                now.duration_since(opened).as_millis(),
                page.generation,
                page.pending.len()
            );
        }
        if page.playing {
            page.playing_requested = None;
            page.idle_since = None;
        }
    }

    pub fn due(&mut self, now: Instant) -> Vec<App> {
        let mut due = Vec::new();
        for app in App::ALL {
            let Some(page) = self.pages.get_mut(&app) else { continue };
            page.pending.retain(|_, at| now.duration_since(*at) < REQUEST_TIMEOUT);
            if !page.resident {
                continue;
            }
            if page.reason(now).is_some() {
                page.idle_since = None;
                continue;
            }
            let since = *page.idle_since.get_or_insert(now);
            if now.duration_since(since) >= IDLE {
                due.push(app);
            }
        }
        due
    }

    pub fn snapshot(&self) -> Vec<Value> {
        App::ALL
            .into_iter()
            .filter_map(|app| {
                self.pages.get(&app).map(|page| {
                    json!({
                        "type": "mediaResource",
                        "app": app,
                        "generation": page.generation,
                        "resident": page.resident,
                    })
                })
            })
            .collect()
    }

    pub fn summary(&self, now: Instant) -> String {
        let pages = App::ALL
            .into_iter()
            .map(|app| {
                let Some(page) = self.pages.get(&app).filter(|page| page.resident) else {
                    return format!("{} absent", app.name());
                };
                format!(
                    "{} {} idle={}s pending={}",
                    app.name(),
                    page.reason(now).unwrap_or("idle"),
                    page.idle_since.map_or(0, |since| now.duration_since(since).as_secs()),
                    page.pending.len()
                )
            })
            .collect::<Vec<_>>()
            .join("; ");
        format!("{pages}; map resident={}", self.map_resident)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn open(resources: &mut Resources, now: Instant) {
        resources.sync(App::Bilibili, true, false, now);
        resources.report(&mut json!({"type":"bilibili", "playing":false}), now);
    }
    #[test]
    fn closes_at_thirty_seconds_and_reentry_restarts_deadline() {
        let now = Instant::now();
        let mut resources = Resources::default();
        open(&mut resources, now);
        assert!(resources.due(now).is_empty());
        assert!(resources.due(now + Duration::from_secs(29)).is_empty());
        assert_eq!(resources.due(now + IDLE), [App::Bilibili]);
        resources.activity(App::Bilibili, Some(true), None);
        assert!(resources.due(now + IDLE).is_empty());
        resources.activity(App::Bilibili, Some(false), None);
        assert!(resources.due(now + IDLE).is_empty());
        assert_eq!(resources.due(now + IDLE * 2), [App::Bilibili]);
    }
    #[test]
    fn protects_playback_login_and_automatic_resume() {
        let now = Instant::now();
        let mut resources = Resources::default();
        open(&mut resources, now);
        resources.report(&mut json!({"type":"bilibili", "playing":true}), now);
        assert!(resources.due(now + IDLE * 3).is_empty());
        resources.activity(App::Bilibili, None, Some(true));
        resources.report(&mut json!({"type":"bilibili", "playing":false}), now);
        assert!(resources.due(now + IDLE * 4).is_empty());
        resources.activity(App::Bilibili, None, Some(false));
        resources.sync(App::Bilibili, true, true, now);
        assert!(resources.due(now + IDLE * 5).is_empty());
        resources.sync(App::Bilibili, true, false, now);
        assert!(resources.due(now + IDLE * 6).is_empty());
        assert_eq!(resources.due(now + IDLE * 7), [App::Bilibili]);
    }
    #[test]
    fn requests_timeout_and_passive_commands_do_not_revive_or_extend_idle() {
        let now = Instant::now();
        let mut resources = Resources::default();
        assert!(!resources.command(&json!({"type":"bilibili","command":{"action":"volume"}}), now));
        open(&mut resources, now);
        resources.command(&json!({"type":"bilibili","command":{"action":"ask","id":1}}), now);
        assert!(resources.due(now).is_empty());
        assert!(resources.due(now + REQUEST_TIMEOUT).is_empty());
        resources.command(&json!({"type":"bilibili","command":{"action":"hide"}}), now + IDLE);
        assert_eq!(resources.due(now + REQUEST_TIMEOUT + IDLE), [App::Bilibili]);
    }
    #[test]
    fn loading_without_a_report_eventually_expires() {
        let now = Instant::now();
        let mut resources = Resources::default();
        resources.sync(App::Player, true, false, now);
        assert!(resources.due(now + REQUEST_TIMEOUT - Duration::from_secs(1)).is_empty());
        assert!(resources.due(now + REQUEST_TIMEOUT).is_empty());
        assert!(resources.due(now + REQUEST_TIMEOUT + IDLE - Duration::from_secs(1)).is_empty());
        assert_eq!(resources.due(now + REQUEST_TIMEOUT + IDLE), [App::Player]);
    }

    #[test]
    fn a_delayed_playback_start_is_protected_even_if_old_paused_reports_arrive() {
        let now = Instant::now();
        let mut resources = Resources::default();
        open(&mut resources, now);
        resources.command(&json!({"type":"bilibili","command":{"action":"play"}}), now);
        resources.report(&mut json!({"type":"bilibili","playing":false}), now);
        assert!(resources.due(now + Duration::from_secs(19)).is_empty());
        assert!(resources.due(now + REQUEST_TIMEOUT).is_empty());
        assert_eq!(resources.due(now + REQUEST_TIMEOUT + IDLE), [App::Bilibili]);
    }

    #[test]
    fn completed_requests_no_longer_pin_the_page() {
        let now = Instant::now();
        let mut resources = Resources::default();
        open(&mut resources, now);
        resources.command(&json!({"type":"bilibili","command":{"action":"ask","id":1}}), now);
        resources.report(&mut json!({"type":"bilibiliAnswer","id":1}), now);
        assert!(resources.due(now).is_empty());
        assert_eq!(resources.due(now + IDLE), [App::Bilibili]);
    }

    #[test]
    fn youtube_language_only_starts_a_page_when_the_user_opens_its_app() {
        let now = Instant::now();
        let mut resources = Resources::default();
        let language = json!({"type":"youtube","command":{"action":"language","code":"en"}});
        assert!(!resources.command(&language, now));
        resources.activity(App::Youtube, Some(true), None);
        assert!(resources.command(&language, now));
        resources.activity(App::Youtube, Some(false), None);
        assert!(!resources.command(&language, now));
    }

    #[test]
    fn generations_reject_old_commands_and_report_answers_finish_requests() {
        let now = Instant::now();
        let mut resources = Resources::default();
        open(&mut resources, now);
        resources.command(&json!({"type":"bilibili","command":{"action":"ask","id":2}}), now);
        let mut answer = json!({"type":"bilibiliAnswer","id":2});
        resources.report(&mut answer, now);
        assert_eq!(answer["generation"], 1);
        assert!(resources.due(now).is_empty());
        assert_eq!(resources.due(now + IDLE), [App::Bilibili]);
        resources.sync(App::Bilibili, false, false, now);
        open(&mut resources, now);
        assert!(!resources.command(&json!({"type":"bilibili","generation":1,"command":{"action":"play"}}), now));
        assert!(resources.command(&json!({"type":"bilibili","generation":2,"command":{"action":"play"}}), now));
    }
}
