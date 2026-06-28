import { enqueueDueRefreshes } from "../lib/publishing";

// ===========================================================================
// Auto-refresh scheduler
//
// Periodically scans for publications whose bump interval is due and enqueues
// refresh jobs. Runs inside the worker process. In a multi-replica deployment
// this should be guarded by a single-leader lock (e.g. a Redis SETNX) so only
// one instance schedules; kept simple here with a fixed tick.
// ===========================================================================

const TICK_MS = Number(process.env.SCHEDULER_TICK_MS ?? 60_000);

export function startScheduler(): NodeJS.Timeout {
  const tick = async () => {
    try {
      const n = await enqueueDueRefreshes();
      if (n > 0) {
        // eslint-disable-next-line no-console
        console.log(`⏱️  Scheduler enqueued ${n} refresh job(s)`);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Scheduler tick failed", err);
    }
  };
  void tick();
  return setInterval(tick, TICK_MS);
}
