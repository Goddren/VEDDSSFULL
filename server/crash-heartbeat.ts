// ── Crash-cause hunt: loop registry + heartbeat + worker witness ────────────
// WHY THIS EXISTS (2026-11-16): the production process keeps dying SILENTLY.
// Three deaths on 2026-11-16 alone (~04:39 CT, ~19:00 CT, ~19:05 CT), each
// leaving ZERO recorded process errors (PR #46) and — for the 19:00 boot,
// which lived only ~4–7 minutes — a memory trail (PR #48) peaking at just
// 224 MB, nowhere near the instance limit. With PR #46 the global handlers
// record-and-continue, so a plain JS throw cannot kill this process anymore.
// What remains: (a) an external kill (host/OOM of the instance), (b) a
// BLOCKED event loop (a synchronous spin runs no handler, no timer, no log),
// or (c) a death inside native code. The existing instrumentation cannot
// tell these apart because everything that could report runs on the main
// loop that may itself be the thing that stopped.
//
// WHAT THIS MODULE DOES:
//  1. LOOP REGISTRY — named engine loops record their last tick
//     (loopTick). The heartbeat snapshot names every loop's last tick, so a
//     post-mortem shows WHICH loop stopped first.
//  2. MAIN HEARTBEAT — every ~30s a snapshot {bootId, at, uptimeSeconds,
//     rssMB, loops} is persisted to runtime_state ('crash_heartbeat' /
//     'latest') using the same cross-boot capture discipline as the memory
//     trail: on boot the stored record is captured as previousBoot BEFORE
//     this boot's first persist can overwrite it.
//  3. WORKER WITNESS — a tiny worker thread with its own timer persists
//     its own heartbeat (to a small file on the instance disk, which
//     survives a process restart on the same instance) every ~15s,
//     including the last time it heard from the main thread. After a death:
//       - worker heartbeat kept advancing while its last-main-message froze
//         → the main event loop was BLOCKED;
//       - worker and main stop together → the process died / was killed.
//     The main thread also mirrors the worker's latest record into its DB
//     snapshot whenever it can read it, so the DB copy carries the witness
//     state for as long as the main loop was alive to copy it.
//
//  Kill switch: CRASH_HEARTBEAT=off disables the heartbeat interval and the
//  worker (loopTick stays a cheap in-memory no-op-cost record).
//  Discipline (same as process-guards): NOTHING here may throw; every entry
//  point is wrapped; intervals are unref'd; persistence is best-effort and
//  silent on failure; a heartbeat failure must never affect boot or trading.
//
// WIP — implementation in progress.
