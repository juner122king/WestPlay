use std::path::Path;
use westplay_mapdata::files::GameFiles;
use westplay_setup::{cab_mark, game_mod, places, tablet};

fn main() {
    let ats_dir = Path::new(r"D:\Program Files (x86)\Steam\steamapps\common\American Truck Simulator");
    println!("Mounting ATS from: {}", ats_dir.display());
    let files = GameFiles::install(ats_dir).expect("Failed to mount ATS files");
    println!("Mounted {} archives", files.mounts().len());

    let trucks = tablet::trucks(&files).expect("Failed to get trucks");
    println!("Found {} spots for tablet in ATS:", trucks.len());
    for spot in &trucks {
        println!("  Truck: {}, Slot: {:?}", spot.truck, spot.slot);
    }

    let marks = cab_mark::for_tablet(&files, &[], &trucks);
    println!("Found {} cab marks", marks.scripts.len());

    let (bytes, built) = game_mod::build(&files, &[], &GameFiles::new(Vec::new()), &marks)
        .expect("Failed to build westplay.scs");
    println!("Build report:");
    println!("  Patched layouts: {:?}", built.patched);
    println!("  Missing layouts: {:?}", built.missing);
    println!("  Cab marks: {}", built.cab_marks);
    println!("  Scs size: {} bytes", bytes.len());

    let wp_docs = places::westplay_documents().expect("Failed to get WestPlay documents folder");
    std::fs::create_dir_all(&wp_docs).expect("Failed to create WestPlay docs folder");
    let scs_path = wp_docs.join(game_mod::FILE_NAME);
    std::fs::write(&scs_path, &bytes).expect("Failed to write westplay.scs");
    println!("Successfully wrote: {}", scs_path.display());
}
