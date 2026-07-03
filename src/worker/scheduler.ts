import { enqueueDueRefreshes, enqueueDueStatusChecks } from "../lib/publishing";
import { runCanaries } from "./canary";

// ===========================================================================
// Auto-refresh scheduler
//
// Periodically scans for publications whose bump interval is due and enqueues
// refresh jobs. Runs inside the worker process. In a multi-replica deployment
// this should be guarded by a single-leader lock (e.g. a Redis SETNX) so only
// one instance schedules; kept simple here with a fixed tick.
// ===========================================================================

const TICK_MS = Number(process.env.SCHEDULER_TICK_MS ?? 60_000);
// How often the portal canary runs (default: every 12 h). Launches a browser
// per portal, so it's deliberately infrequent.
const CANARY_MS = Number(process.env.CANARY_INTERVAL_MS ?? 12 * 60 * 60 * 1000);
// Run the first canary a few minutes after boot (catches breakage right after a
// deploy), then on the interval.
let nextCanaryAt = Date.now() + 5 * 60 * 1000;

export function startScheduler(): NodeJS.Timeout {
  const tick = async () => {
    try {
      const n = await enqueueDueRefreshes();
      if (n > 0) {
        // eslint-disable-next-line no-console
        console.log(`⏱️  Scheduler enqueued ${n} refresh job(s)`);
      }
      const s = await enqueueDueStatusChecks();
      if (s > 0) {
        // eslint-disable-next-line no-console
        console.log(`⏱️  Scheduler enqueued ${s} status check(s)`);
      }
      if (Date.now() >= nextCanaryAt) {
        nextCanaryAt = Date.now() + CANARY_MS;
        // Fire-and-forget: the canary launches browsers and must not block ticks.
        void runCanaries().catch((err) => {
          // eslint-disable-next-line no-console
          console.error("Canary run failed", err);
        });
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Scheduler tick failed", err);
    }
  };
  void tick();
  return setInterval(tick, TICK_MS);
}
