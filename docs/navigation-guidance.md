# Navigation UI, lane advice and route overview

## Behaviour

- The full-screen map and Dashboard instruction card use a teal instruction panel and an inset lane ribbon. Recommended lanes are white with a thicker arrow and a small underline; other lanes are muted. No current-lane marker is inferred.
- The map keeps the existing MapLibre road/building renderer, with a purple active route, a blue vehicle arrow and numbered waypoint markers.
- The upper-right speed capsule uses a circular red-ring limit for ETS2 and a rectangular SPEED LIMIT sign for ATS. The game identifier, not mph/km/h, selects the sign. Actual speed stays visible at zero, turns red when over the limit, and includes its unit. Missing limits are omitted; missing telemetry hides the component.
- Route overview is available only for an active route in the Maps app. It frames the remaining route, truck, waypoints and destination from above, north up, and hides instruction, lane, ETA and speed overlays. Map controls and the existing shell remain visible.
- After 15 seconds without explicit map interaction, overview returns to the driving camera and restores the overlays. Dragging/holding suspends the timer; release starts a fresh 15 seconds. Hover, telemetry and camera animation do not reset it. The return button works immediately, and overview zoom does not overwrite driving zoom.
- Closing Maps, disposing the map, opening search, cancelling the route or losing navigation exits overview. Route geometry updates reframe the overview after a gesture ends. Search/Directions candidate-route preview remains a separate mode and is not subject to this timeout.

## Module boundaries

- `laneGuidance.ts` validates host advice and selects the active hint; `useLaneHint.ts` advances its hysteresis on store updates.
- `LaneRibbon.tsx` and `SpeedDisplay.tsx` render the shared navigation overlays.
- `routeOverview.ts` owns the overview session timer and route bounds; `liveMap.ts` owns MapLibre camera integration and gesture-listener teardown.
- Search/Directions preview remains independent of current-route overview.

## Lane-data path and conservative fallback

`mapdata::lane_guidance` groups prefab inbound curves by their physical lane centres, orders them in travel direction, and traverses the directed navigation graph to find every truck-permitted exit for every lane. Multiple valid lanes are all recommended; an arbitrary shortest path is not treated as the only valid lane. Combined directions are preserved.

The route worker includes advice only when the inbound road lane count matches the prefab entrance. The advice interval extends backwards through ordinary roads with the same lane count, stopping at another prefab, an unknown road or a count change. Driving side comes from the placed entrance geometry, including left-hand traffic, rather than a country heuristic.

The existing `routePaths` message now has optional `laneHints`:

```ts
interface LaneHint {
  node: number
  start: number
  end: number // node + 1; valid route segments are [start, end)
  lanes: {
    directions: ('straight' | 'left' | 'right' | 'slight-left' | 'slight-right' | 'u-turn')[]
    recommended: boolean
  }[]
}
```

Advice is bound to the existing route ID. Old hosts may omit the field. The UI rejects invalid, stale or trivial advice and clears it on reroute. It enters at 1,000 game-distance metres and retains the same event up to 1,200 metres to avoid threshold chatter. Straight-through lane decisions are independent of turn instructions.

Single-lane approaches, all-lanes-usable decisions, ambiguous spacing, broken connections, missing truck paths and cyclic/roundabout prefabs produce no ribbon. The UI continues showing ordinary navigation instead. There is no car-only fallback, guessed lane advice, signpost text parser, lane-level road highlighting or new DLL hook/shared-memory protocol version.

## Verification

Run from the repository root:

```powershell
npm --prefix ui test
npm --prefix ui run lint
npm --prefix ui run build
$env:CC = (Resolve-Path target/toolchains/llvm-mingw-20260602-ucrt-x86_64/bin/clang.exe).Path
$env:AR = (Resolve-Path target/toolchains/llvm-mingw-20260602-ucrt-x86_64/bin/llvm-ar.exe).Path
cargo test --workspace --locked
```

The local default GCC shim cannot build mimalloc without the project's LLVM-MinGW CC/AR configuration; use the same toolchain as `tools/build_resources.ps1` rather than changing project dependencies to work around it.

Automated cases cover multi-lane exits, shared entry curves/combined arrows, truck restrictions, mirrored geometry, cyclic/broken graphs, message serialization, stale route results, absent fields, hint eligibility/hysteresis, zero speed, sign/unit independence, unknown limits, overspeed, route bounds and overview timer/gesture cancellation.

Browser visual checks use the developer's locally generated ETS2/ATS maps and **synthetic navigation/telemetry fixtures**, not a claimed live-game route. Preview captures are kept under ignored `target/navigation-preview/`. The checks cover day/night, Dashboard and compact screens, hidden overview cards, endpoint framing, manual/automatic return and driving-zoom preservation.

Live driving verification on actual junctions and mod-prefab coverage, plus a controlled before/after performance comparison, still require an in-game acceptance pass. No game installation or installed WestPlay binary is overwritten by this change. CabPlay screenshots are design references only; no packaged CabPlay source or image assets are copied.

### Local validation result (2026-11-11)

- UI: 78 test files / 434 tests passed; TypeScript/Vite production build passed.
- Rust: 613 workspace tests passed with LLVM-MinGW CC/AR; workspace Clippy completed with warnings.
- Browser: no page errors in the exercised scenes. Confirmed complete overview framing, hidden overlays, 15-second auto-return, driving-zoom preservation after overview zoom, search cancellation of overview, and route cancellation/zero-speed display. Day/night, ATS sign, Dashboard and 1280×480 compact screenshots were inspected.
- Existing lint warnings and the existing large-bundle warning remain; this is not a claim of zero warnings or an in-game performance benchmark.
- Production `npm run build` passed, including the map helper, packaging-stage DLL and Tauri application. Output: `target/release/westplay.exe`; no deployment flag was used.
- NSIS release packaging via `npm run build:release` passed. The installer was extracted without execution; all 69 UI files, license files and companion binaries were checked. The main executable differed only by Tauri's expected NSIS bundle marker. SHA256 and the package manifest are kept beside the installer under ignored `target/release/bundle/nsis/`, not committed as source.
