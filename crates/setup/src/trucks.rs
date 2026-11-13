//! The trucks WestPlay is made for, as players know them, and whether a game has each: a truck's screen is
//! drawn by the GPS script its interior names (`gps_path`), and WestPlay draws on the screens whose scripts
//! its mod patches (`westplay_shared::screen_layouts`).
//!
//! From the game's own definitions (1.61): most trucks' interiors name the stock `/ui/gps.sii` (`generic`,
//! the Scania S and R with their 7" screen among them); the DAF 2021 (XF, XG, XG+) names
//! `daf_2021_gps.sii`; the Scania S and R's Smart Dash interior (`interior/computers_2025.sui`)
//! `scania_2025_gps.sii`; the Renault T's 2024 interior `renault_t_2024_gps.sii`; the Iveco S-Way's
//! `iveco_sway_ic10_gps.sii` (its UK interiors' `iveco_sway_ic10_gps_mph.sii`).

use westplay_mapdata::files::GameFiles;

use crate::game::Kind;
use crate::profiles::Profile;

/// How a game has a truck.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Source {
    /// The game's own (or a DLC's): its definition, `def/vehicle/truck/<id>/data.sii`.
    Game(&'static str),
    /// An official Road Trip car: its definition, `def/vehicle/car/<id>/data.sii`.
    Car(&'static str),
    /// A mod's, found by these words (all of them, in its name or file name): installed (in the game's `mod`
    /// folder or the Workshop), active in a profile or not.
    Mod(&'static [&'static str]),
    /// Any truck: WestPlay's tablet, in every game.
    Any,
}

/// A truck WestPlay is made for.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Truck {
    pub id: &'static str,
    /// As players know it (in English).
    pub name: &'static str,
    pub source: Source,
    /// The screen layout WestPlay draws on in it (`westplay_shared::screen_layouts`), `None`: not yet.
    pub layout: Option<&'static str>,
}

/// ETS2's.
pub const TRUCKS: &[Truck] = &[
    Truck { id: "daf-xf-2021", name: "DAF XF 2021", source: Source::Game("daf.2021"), layout: Some("daf-2021") },
    Truck { id: "daf-xg-2021", name: "DAF XG & XG+ 2021", source: Source::Game("daf.2021"), layout: Some("daf-2021") },
    Truck {
        id: "daf-xf-electric",
        name: "DAF XF Electric",
        source: Source::Game("daf.xf_electric"),
        layout: Some("daf-2021"),
    },
    Truck { id: "daf-xd", name: "DAF XD", source: Source::Game("daf.xd"), layout: Some("daf-2021") },
    Truck {
        id: "jasper-daf-2021",
        name: "Jasper’s DAF 2021",
        source: Source::Mod(&["jasper", "daf"]),
        layout: Some("daf-2021"),
    },
    Truck {
        id: "scania-7",
        name: "Scania S and R - 7\" screen",
        source: Source::Game("scania.s_2016"),
        layout: Some("generic"),
    },
    Truck {
        id: "scania-s-bev",
        name: "Scania S BEV - 7\" screen",
        source: Source::Game("scania.s_2024e"),
        layout: Some("generic"),
    },
    Truck {
        id: "scania-smart-dash",
        name: "Scania S and R - Smart Dash",
        source: Source::Game("scania.s_2016"),
        layout: Some("scania-2025"),
    },
    Truck { id: "iveco-sway", name: "Iveco S-Way", source: Source::Game("iveco.sway"), layout: Some("iveco-sway") },
    Truck {
        id: "renault-t-2024",
        name: "Renault T (2024)",
        source: Source::Game("renault.t"),
        layout: Some("renault-t-2024"),
    },
    Truck {
        id: "volvo-fh-2021",
        name: "Volvo FH (2021)",
        source: Source::Game("volvo.fh_2021"),
        layout: Some("volvo-fh"),
    },
    Truck {
        id: "volvo-fh-2024",
        name: "Volvo FH (2024)",
        source: Source::Game("volvo.fh_2024"),
        layout: Some("volvo-fh"),
    },
    // Oyuncuyusbis' coaches (mods), WestPlay on their own screens (owner 2026-10-24).
    Truck {
        id: "travego-16-shd",
        name: "Mercedes-Benz Travego 16 SHD (Oyuncuyusbis)",
        source: Source::Mod(&["travego"]),
        layout: Some("travego-16"),
    },
    Truck {
        id: "man-lions-coach",
        name: "MAN Lion's Coach (Oyuncuyusbis)",
        source: Source::Mod(&["lions", "coach"]),
        layout: Some("man-lions-coach"),
    },
    Truck {
        id: "setra-s516-hd",
        name: "Setra S 516 HD/2 (Oyuncuyusbis)",
        source: Source::Mod(&["setra", "516"]),
        layout: Some("setra-516"),
    },
    Truck {
        id: "setra-s531-dt",
        name: "Setra S 531 DT (Oyuncuyusbis)",
        source: Source::Mod(&["setra", "531"]),
        layout: Some("setra-531"),
    },
    // Any other truck, with WestPlay's tablet on its dashboard (owner 2026-10-24).
    Truck {
        id: "any-truck-tablet",
        name: "Any truck – with the WestPlay tablet",
        source: Source::Any,
        layout: Some("tablet"),
    },
];

/// ATS's official vehicles: the Road Trip Fords on their own screens, the trucks awaiting their own-screen
/// support (`layout` `None`), and the tablet in any truck with a suitable accessory slot.
pub const ATS_TRUCKS: &[Truck] = &[
    Truck {
        id: "ford-f150-2023",
        name: "Ford F-150 (2023)",
        source: Source::Car("ford.f150_23"),
        layout: Some("ford-f150-2023"),
    },
    Truck {
        id: "ford-bronco-2024",
        name: "Ford Bronco (2024)",
        source: Source::Car("ford.bronco_24"),
        layout: Some("ford-bronco-2024"),
    },
    Truck { id: "volvo-vnl-2018", name: "Volvo VNL (2018)", source: Source::Game("volvo.vnl2018"), layout: None },
    Truck {
        id: "volvo-vnl-2025",
        name: "Volvo VNL (2025)",
        source: Source::Game("volvo.vnl2025"),
        layout: Some("volvo-vnl-2025"),
    },
    Truck { id: "volvo-vnr-electric", name: "Volvo VNR Electric", source: Source::Game("volvo.vnr_e"), layout: None },
    Truck {
        id: "freightliner-cascadia-2019",
        name: "Freightliner Cascadia (2019) - digital dash",
        source: Source::Game("freightliner.cascadia2019"),
        layout: None,
    },
    Truck {
        id: "freightliner-cascadia-2024",
        name: "Freightliner Cascadia (2024) - digital dash",
        source: Source::Game("freightliner.cascadia2024"),
        layout: Some("freightliner-cascadia-2024"),
    },
    Truck {
        id: "kenworth-t680-2022",
        name: "Kenworth T680 (2022)",
        source: Source::Game("kenworth.t680_2022"),
        layout: None,
    },
    Truck { id: "western-star-57x", name: "Western Star 57X", source: Source::Game("westernstar.57x"), layout: None },
    Truck { id: "western-star-49x", name: "Western Star 49X", source: Source::Game("westernstar.49x"), layout: None },
    Truck { id: "mack-anthem", name: "Mack Anthem", source: Source::Game("mack.anthem"), layout: None },
    Truck { id: "mack-pinnacle", name: "Mack Pinnacle", source: Source::Game("mack.pinnacle"), layout: None },
    Truck { id: "peterbilt-579", name: "Peterbilt 579", source: Source::Game("peterbilt.579"), layout: None },
    Truck {
        id: "any-truck-tablet",
        name: "Any truck – with the WestPlay tablet",
        source: Source::Any,
        layout: Some("tablet"),
    },
];

/// The trucks WestPlay is made for in the game `kind`.
pub fn trucks(kind: Kind) -> &'static [Truck] {
    match kind {
        Kind::Ets2 => TRUCKS,
        Kind::Ats => ATS_TRUCKS,
    }
}

/// Whether a player can have WestPlay in a truck.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Fit {
    /// It's in their game, and WestPlay draws on its screen.
    Ready,
    /// It isn't in their game (a DLC they don't have, a mod they don't play with).
    NotInGame,
    /// It's in their game, but WestPlay doesn't draw on its screen yet.
    NotYet,
}

/// Each truck WestPlay is made for in the game `kind`, in `files` (the game), with the layouts its mod patched
/// there (`patched`); a mod's truck by the player's profiles' mods and the mods installed (`installed`:
/// `profiles::installed`), active or not.
pub fn fit(
    kind: Kind,
    files: &GameFiles,
    patched: &[&str],
    profiles: &[Profile],
    installed: &[String],
) -> Vec<(Truck, Fit)> {
    trucks(kind)
        .iter()
        .map(|truck| {
            let in_game = match truck.source {
                Source::Game(id) => files.read(&format!("def/vehicle/truck/{id}/data.sii")).ok().flatten().is_some(),
                Source::Car(id) => files.read(&format!("def/vehicle/car/{id}/data.sii")).ok().flatten().is_some(),
                Source::Mod(words) => {
                    let has = |named: &str| {
                        let named = named.to_lowercase();
                        words.iter().all(|word| named.contains(word))
                    };
                    profiles.iter().flat_map(|profile| &profile.mods).any(|m| has(&format!("{} {}", m.package, m.name)))
                        || installed.iter().any(|named| has(named))
                }
                Source::Any => true,
            };
            let fit = match truck.layout {
                _ if !in_game => Fit::NotInGame,
                Some(layout) if patched.contains(&layout) => Fit::Ready,
                // Its screen's script isn't in this game (or WestPlay doesn't draw on it yet).
                _ => Fit::NotYet,
            };
            (*truck, fit)
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::profiles::{MapContent, Mod};
    use westplay_mapdata::files::Mount;

    fn game_with(trucks: &[&str]) -> (GameFiles, std::path::PathBuf) {
        let root = std::env::temp_dir().join(format!("westplay-trucks-{}-{}", std::process::id(), trucks.len()));
        let _ = std::fs::remove_dir_all(&root);
        for id in trucks {
            let dir = root.join("def/vehicle/truck").join(id);
            std::fs::create_dir_all(&dir).unwrap();
            std::fs::write(dir.join("data.sii"), "SiiNunit\n{\n}\n").unwrap();
        }
        (GameFiles::new(vec![Mount::Folder(root.clone())]), root)
    }

    fn profile_with(mods: &[(&str, &str)]) -> Profile {
        let mut profile = Profile::new_player(crate::game::Kind::Ets2);
        profile.mods = mods
            .iter()
            .map(|(package, name)| Mod {
                package: (*package).into(),
                name: (*name).into(),
                files: None,
                categories: vec![],
                author: None,
                map: MapContent::default(),
                problem: None,
            })
            .collect();
        profile
    }

    #[test]
    fn tells_which_trucks_a_player_can_have_westplay_in() {
        let (files, root) = game_with(&["daf.2021", "scania.s_2016", "iveco.sway"]);
        let profiles = [profile_with(&[("Jaspers_DAF_2021_v1.2", "DAF 2021 Jasper")])];
        let fits = fit(Kind::Ets2, &files, &["generic", "daf-2021"], &profiles, &[]);
        let of = |name: &str| fits.iter().find(|(truck, _)| truck.name.starts_with(name)).unwrap().1;
        assert_eq!(of("DAF XF"), Fit::Ready);
        assert_eq!(of("Jasper"), Fit::Ready);
        assert_eq!(of("Scania S and R - 7"), Fit::Ready);
        // Its script isn't in this game.
        assert_eq!(of("Scania S and R - Smart Dash"), Fit::NotYet);
        // Its scripts weren't patched (the DLC's not in this game's files).
        assert_eq!(of("Iveco"), Fit::NotYet);
        let with_sway = fit(Kind::Ets2, &files, &["iveco-sway"], &profiles, &[]);
        assert_eq!(with_sway.iter().find(|(truck, _)| truck.name.starts_with("Iveco")).unwrap().1, Fit::Ready);
        // Not in the game.
        assert_eq!(of("Renault"), Fit::NotInGame);
        // Any truck with the tablet: in every game, once the mod has it.
        assert_eq!(of("Any truck"), Fit::NotYet);
        let with_tablet = fit(Kind::Ets2, &files, &["tablet"], &profiles, &[]);
        assert_eq!(with_tablet.iter().find(|(truck, _)| truck.name.starts_with("Any truck")).unwrap().1, Fit::Ready);
        let jasper = |installed: &[String]| {
            fit(Kind::Ets2, &files, &["daf-2021"], &[], installed)
                .iter()
                .find(|(t, _)| t.name.starts_with("Jasper"))
                .unwrap()
                .1
        };
        // Neither installed nor in a profile.
        assert_eq!(jasper(&[]), Fit::NotInGame);
        // Installed in the mod folder (its file's name), active in no profile: it's in the game all the same.
        assert_eq!(jasper(&["Jaspers_DAF_2021_v1.2".into()]), Fit::Ready);
        // A Workshop item, by its manifest's name.
        assert_eq!(jasper(&["DAF 2021 by Jasper".into()]), Fit::Ready);
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn the_official_fords_are_found_in_the_cars_and_need_their_own_screens() {
        for (model, layout) in [("ford.f150_23", "ford-f150-2023"), ("ford.bronco_24", "ford-bronco-2024")] {
            // A truck with the same id is not the official Road Trip car.
            let (files, root) = game_with(&[model]);
            let car_fit = |patched: &[&str]| {
                fit(Kind::Ats, &files, patched, &[], &[]).into_iter().find(|(truck, _)| truck.id == layout).unwrap().1
            };
            assert_eq!(car_fit(&[layout]), Fit::NotInGame);
            let car = root.join(format!("def/vehicle/car/{model}"));
            std::fs::create_dir_all(&car).unwrap();
            std::fs::write(car.join("data.sii"), "SiiNunit\n{\n}\n").unwrap();
            assert_eq!(car_fit(&["generic", "tablet"]), Fit::NotYet);
            let other = if layout == "ford-f150-2023" { "ford-bronco-2024" } else { "ford-f150-2023" };
            assert_eq!(car_fit(&[other]), Fit::NotYet);
            assert_eq!(car_fit(&[layout]), Fit::Ready);
            assert!(fit(Kind::Ets2, &files, &[layout], &[], &[]).iter().all(|(truck, _)| truck.id != layout));
            let _ = std::fs::remove_dir_all(&root);
        }
    }

    #[test]
    fn the_2024_cascadia_needs_its_digital_dash_screen() {
        let (files, root) = game_with(&["freightliner.cascadia2024"]);
        let casc_fit = |patched: &[&str]| {
            fit(Kind::Ats, &files, patched, &[], &[])
                .into_iter()
                .find(|(truck, _)| truck.id == "freightliner-cascadia-2024")
                .unwrap()
                .1
        };

        assert_eq!(casc_fit(&[]), Fit::NotYet);
        assert_eq!(casc_fit(&["generic", "tablet"]), Fit::NotYet);
        assert_eq!(casc_fit(&["freightliner-cascadia-2024"]), Fit::Ready);
        assert!(
            fit(Kind::Ets2, &files, &["freightliner-cascadia-2024"], &[], &[])
                .iter()
                .all(|(truck, _)| truck.id != "freightliner-cascadia-2024")
        );

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn atss_trucks_are_its_own_their_screens_not_yet() {
        // Four entries avoid sharing the three-truck test fixture's temporary directory.
        let (files, root) = game_with(&["volvo.vnl2018", "volvo.vnl2025", "mack.anthem", "kenworth.t680_2022"]);
        // The stock screen patched (as ATS's mod has it): the trucks on it still not WestPlay's there.
        let fits = fit(Kind::Ats, &files, &["generic", "tablet"], &[], &[]);
        let of = |id: &str| fits.iter().find(|(truck, _)| truck.id == id).unwrap().1;
        assert_eq!(of("volvo-vnl-2018"), Fit::NotYet);
        assert_eq!(of("volvo-vnl-2025"), Fit::NotYet);
        assert_eq!(of("mack-anthem"), Fit::NotYet);
        assert_eq!(of("peterbilt-579"), Fit::NotInGame);
        assert_eq!(of("any-truck-tablet"), Fit::Ready);
        let vnl = fit(Kind::Ats, &files, &["volvo-vnl-2025"], &[], &[]);
        assert_eq!(vnl.iter().find(|(truck, _)| truck.id == "volvo-vnl-2025").unwrap().1, Fit::Ready);
        // None of ETS2's.
        assert!(fits.iter().all(|(truck, _)| !truck.id.starts_with("daf-")));
        let _ = std::fs::remove_dir_all(&root);
    }
}
