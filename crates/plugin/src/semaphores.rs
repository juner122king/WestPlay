//! Traffic light semaphores around the truck: states and countdown timers read from game memory
//! by hooking `traffic_semaphore_actor_t` update.

use std::collections::HashMap;
use std::ffi::c_void;
use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};
use std::sync::{LazyLock, Mutex};

use westplay_shared::{SEMAPHORES_MAX, Semaphore, SemaphoresBlock};
use windows::Win32::System::LibraryLoader::GetModuleHandleW;

use crate::navigation::Image;
use crate::{bridge, hooks, log};

/// The start of `traffic_semaphore_actor_t` update state:
/// `push rbx; sub rsp, 20h; mov rax, [rcx+100h]; mov rbx, rcx; test rax, rax; je short; movsxd rdx, dword ptr [rax+70h]; mov [rsp+30h], rdi; movzx edi, byte ptr [rcx+108h]; cmp edx, 20h`
const SEMAPHORE_UPDATE: [Option<u8>; 40] = [
    Some(0x40), Some(0x53), // push rbx
    Some(0x48), Some(0x83), Some(0xec), Some(0x20), // sub rsp, 20h
    Some(0x48), Some(0x8b), Some(0x81), Some(0x00), Some(0x01), Some(0x00), Some(0x00), // mov rax, [rcx+100h]
    Some(0x48), Some(0x8b), Some(0xd9), // mov rbx, rcx
    Some(0x48), Some(0x85), Some(0xc0), // test rax, rax
    Some(0x74), None, // je short
    Some(0x48), Some(0x63), Some(0x50), Some(0x70), // movsxd rdx, dword ptr [rax+70h]
    Some(0x48), Some(0x89), Some(0x7c), Some(0x24), Some(0x30), // mov [rsp+30h], rdi
    Some(0x0f), Some(0xb6), Some(0xb9), Some(0x08), Some(0x01), Some(0x00), Some(0x00), // movzx edi, byte ptr [rcx+108h]
    Some(0x83), Some(0xfa), Some(0x20), // cmp edx, 20h
];

type UpdateFn = unsafe extern "system" fn(*mut u8);
static ORIG_UPDATE: AtomicUsize = AtomicUsize::new(0);
static FRAME_COUNT: AtomicU64 = AtomicU64::new(0);

struct TrackedSemaphore {
    semaphore: Semaphore,
    last_frame: u64,
}

static TRACKED: LazyLock<Mutex<HashMap<usize, TrackedSemaphore>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

unsafe extern "system" fn detour_update(actor: *mut u8) {
    let original = ORIG_UPDATE.load(Ordering::Acquire);
    if original != 0 {
        // SAFETY: original function trampoline
        unsafe {
            let orig_fn: UpdateFn = std::mem::transmute(original);
            orig_fn(actor);
        }
    }
    hooks::guarded(|| {
        // SAFETY: actor pointer was passed directly by the game engine
        unsafe { record_actor(actor) };
    });
}

#[inline]
fn is_valid_ptr(ptr: usize) -> bool {
    ptr >= 0x10000 && ptr < 0x0000_7FFF_FFFF_0000 && (ptr % 8 == 0)
}

/// Reads the actor fields directly from game memory.
///
/// # Safety
/// `actor` must point to a live `traffic_semaphore_actor_t` instance.
unsafe fn record_actor(actor: *mut u8) {
    if actor.is_null() {
        return;
    }

    // State byte at +0x108: 0 = Yellow, 1 = Red, 2 = Red+Amber, 3 = Green, 4 = Off
    let state = unsafe { *actor.add(0x108) };
    if state > 4 {
        return;
    }

    // Read position coordinates and sector indices
    let (x_offset, y_offset, z_offset, sector_x, sector_z) = unsafe {
        let xo = (actor.add(0x28) as *const f32).read_unaligned();
        let yo = (actor.add(0x2c) as *const f32).read_unaligned();
        let zo = (actor.add(0x30) as *const f32).read_unaligned();
        let sx = (actor.add(0x34) as *const i16).read_unaligned();
        let sz = (actor.add(0x36) as *const i16).read_unaligned();
        (xo, yo, zo, sx, sz)
    };

    if !x_offset.is_finite() || !z_offset.is_finite() {
        return;
    }

    // Ignore unspawned prototype templates at world origin (sector 0, 0 with tiny offsets)
    if sector_x == 0 && sector_z == 0 && x_offset.abs() < 10.0 && z_offset.abs() < 10.0 {
        return;
    }

    // Orientation quaternion (w, x, y, z) at +0x38..+0x48
    let (rw, rx, ry, rz) = unsafe {
        let rw = (actor.add(0x38) as *const f32).read_unaligned();
        let rx = (actor.add(0x3c) as *const f32).read_unaligned();
        let ry = (actor.add(0x40) as *const f32).read_unaligned();
        let rz = (actor.add(0x44) as *const f32).read_unaligned();
        (rw, rx, ry, rz)
    };

    // Calculate duration and countdown
    let (duration, countdown) = unsafe {
        let ctrl_ptr = (actor.add(0x100) as *const usize).read_unaligned();
        if is_valid_ptr(ctrl_ptr) {
            let ctrl = ctrl_ptr as *const u8;
            // Intersection traffic light with controller
            // In SCS Prism3D, the controller directly maintains current phase remaining seconds as f32 at +0xb8
            let cd_raw = (ctrl.add(0xb8) as *const f32).read_unaligned();
            let cd = if cd_raw.is_finite() && cd_raw >= 0.0 && cd_raw <= 600.0 {
                cd_raw
            } else {
                0.0
            };

            // Read cycle durations from +0x80, +0x88, +0x90, +0x98 (microseconds as u64)
            let phase = (ctrl.add(0x70) as *const u32).read_unaligned();
            let dur = match phase {
                1 => ((ctrl.add(0x80) as *const u64).read_unaligned() as f32) / 1_000_000.0,
                2 => ((ctrl.add(0x88) as *const u64).read_unaligned() as f32) / 1_000_000.0,
                4 => ((ctrl.add(0x90) as *const u64).read_unaligned() as f32) / 1_000_000.0,
                8 => ((ctrl.add(0x98) as *const u64).read_unaligned() as f32) / 1_000_000.0,
                _ => cd,
            };
            let dur = if dur.is_finite() && dur > 0.0 && dur <= 600.0 { dur } else { cd };
            (dur, cd)
        } else {
            // Standalone semaphore (duration at +0x118, elapsed at +0x13c)
            let dur = (actor.add(0x118) as *const f32).read_unaligned();
            let el = (actor.add(0x13c) as *const f32).read_unaligned();
            if dur.is_finite() && el.is_finite() && dur > 0.0 && dur <= 600.0 {
                (dur, (dur - el).max(0.0))
            } else {
                (0.0, 0.0)
            }
        }
    };

    // Dynamic actor sectors in Prism3D use 512.0m grid tiles
    const SECTOR_TILE_SIZE: f64 = 512.0;
    let world_x = sector_x as f64 * SECTOR_TILE_SIZE + x_offset as f64;
    let world_z = sector_z as f64 * SECTOR_TILE_SIZE + z_offset as f64;
    let world_y = y_offset as f64;

    let heading = if rw.is_finite() && rx.is_finite() && ry.is_finite() && rz.is_finite() {
        let siny_cosp = 2.0 * (rw * ry + rx * rz);
        let cosy_cosp = 1.0 - 2.0 * (ry * ry + rz * rz);
        let yaw = siny_cosp.atan2(cosy_cosp);
        // Turns 0..1 (north 0, clockwise)
        (yaw / (2.0 * std::f32::consts::PI)).rem_euclid(1.0)
    } else {
        0.0
    };

    let sem = Semaphore {
        x: world_x,
        y: world_y,
        z: world_z,
        heading,
        state,
        countdown,
        duration,
    };

    let frame = FRAME_COUNT.load(Ordering::Relaxed);
    let mut tracked = TRACKED.lock().unwrap_or_else(|e| e.into_inner());
    let is_new = !tracked.contains_key(&(actor as usize));
    tracked.insert(actor as usize, TrackedSemaphore { semaphore: sem, last_frame: frame });
    if is_new && state <= 3 {
        log!("semaphores: tracked active actor {actor:p} state={state} dur={duration:.1} cd={countdown:.1} pos=({world_x:.0}, {world_z:.0})");
    }
}

/// Publishes active semaphores around the truck to the bridge shared memory.
pub fn publish(truck_x: f64, truck_z: f64) {
    let Some(bridge) = bridge::get() else { return };
    let frame = FRAME_COUNT.fetch_add(1, Ordering::Relaxed) + 1;
    let mut tracked = TRACKED.lock().unwrap_or_else(|e| e.into_inner());

    // Prune stale actors (not updated for > 180 frames, ~3 seconds)
    tracked.retain(|_, item| frame.saturating_sub(item.last_frame) <= 180);

    // Keep active semaphores within 600m
    const MAX_DISTANCE_SQ: f64 = 600.0 * 600.0;
    let mut nearby: Vec<(f64, Semaphore)> = tracked
        .values()
        .filter_map(|item| {
            // Only publish valid operational signals (0..3: green, yellow, red, red+amber)
            if item.semaphore.state > 3 {
                return None;
            }
            let dx = item.semaphore.x - truck_x;
            let dz = item.semaphore.z - truck_z;
            let dist_sq = dx * dx + dz * dz;
            (dist_sq <= MAX_DISTANCE_SQ).then_some((dist_sq, item.semaphore))
        })
        .collect();

    // Sort ascending by distance so nearest traffic lights come first
    nearby.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap_or(std::cmp::Ordering::Equal));

    let count = nearby.len().min(SEMAPHORES_MAX);
    static LAST_LOGGED_COUNT: AtomicUsize = AtomicUsize::new(usize::MAX);
    let prev = LAST_LOGGED_COUNT.swap(count, Ordering::Relaxed);
    if prev != count {
        log!("semaphores: publishing {count} traffic lights around truck ({truck_x:.0}, {truck_z:.0})");
    }

    let mut block = SemaphoresBlock {
        frame,
        count: count as u32,
        semaphores: [Semaphore::default(); SEMAPHORES_MAX],
    };

    for (i, (_, sem)) in nearby.into_iter().take(SEMAPHORES_MAX).enumerate() {
        block.semaphores[i] = sem;
    }

    bridge.plugin.semaphores.write(&block);
}

/// Finds the `traffic_semaphore_actor_t` update function and installs the MinHook hook.
///
/// # Safety
/// Called in the game's process during plugin initialization.
pub unsafe fn install() -> Result<(), String> {
    // SAFETY: executable module handle
    let base = unsafe { GetModuleHandleW(None) }.ok()
        .ok_or_else(|| "GetModuleHandleW failed".to_string())?.0 as usize;
    // SAFETY: base is the game executable image
    let image = unsafe { Image::of(base) }
        .ok_or_else(|| "Image::of failed".to_string())?;

    let target = image.unique_masked(&SEMAPHORE_UPDATE)
        .ok_or_else(|| "semaphores: update function pattern not found or not unique".to_string())?;

    // SAFETY: target is valid function, detour matches signature
    unsafe {
        hooks::hook(target, detour_update as *mut c_void, &ORIG_UPDATE, "traffic_semaphore_update")?;
    }
    log!("semaphores: hooked traffic_semaphore_update at {target:#x}");
    Ok(())
}
