import "dotenv/config";
import { Worker, type Job, type ConnectionOptions } from "bullmq";
import { createRedisConnection } from "../lib/redis";
import { prisma } from "../lib/db";
import { QUEUE_NAME, type BaseJobData, type TaskName } from "../lib/queue/types";
import { logActivity } from "../lib/logger";
import {
  runPublish,
  runUpdate,
  runRefresh,
  runDelete,
  runCheckStatus,
  markError,
} from "./service";
import { startScheduler } from "./scheduler";
import { pruneDebugBlobs } from "../lib/storage";

// ===========================================================================
// Worker entrypoint
//
// A standalone process (run separately from the Next.js app — see
// docker-compose) that consumes the portal-tasks queue. Concurrency lets it
// process many portals in parallel; BullMQ handles retries/backoff per the
// job options. Designed to scale horizontally: run N replicas of this process.
// ===========================================================================

const CONCURRENCY = Number(process.env.WORKER_CONCURRENCY ?? 10);
// Safety net so a hung browser job can never leave a listing stuck on
// "prebieha publikácia" forever. Must exceed the SMS wait (10 min) so a
// genuine "waiting for the user's code" job isn't killed.
const JOB_TIMEOUT_MS = Number(process.env.JOB_TIMEOUT_MS ?? 14 * 60 * 1000);

const handlers: Record<TaskName, (data: BaseJobData) => Promise<void>> = {
  publish: runPublish,
  update: runUpdate,
  refresh: runRefresh,
  delete: runDelete,
  check_status: runCheckStatus,
};

/** Reject if `p` doesn't settle within `ms` (so a hung job fails cleanly). */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(
      () =>
        reject(
          new Error(
            `Časový limit ${Math.round(ms / 1000)} s vypršal (${label}). Skús publikovať znova.`,
          ),
        ),
      ms,
    );
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

/**
 * On boot, clear publications left mid-flight by a previous crash/restart (e.g.
 * the browser process was OOM-killed) so they don't show "prebieha" forever.
 */
async function recoverStuckPublications(): Promise<void> {
  try {
    const res = await prisma.publication.updateMany({
      where: {
        status: { in: ["PUBLISHING", "UPDATING"] },
        updatedAt: { lt: new Date(Date.now() - 2 * 60 * 1000) },
      },
      data: {
        status: "ERROR",
        lastError:
          "Publikovanie sa prerušilo (reštart služby alebo časový limit). Skús to prosím znova.",
      },
    });
    if (res.count > 0) {
      // eslint-disable-next-line no-console
      console.log(`Recovered ${res.count} stuck publication(s) → ERROR`);
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("recoverStuckPublications failed", e);
  }
}

const worker = new Worker<BaseJobData>(
  QUEUE_NAME,
  async (job: Job<BaseJobData>) => {
    const name = job.name as TaskName;
    const handler = handlers[name];
    if (!handler) throw new Error(`No handler for job "${job.name}"`);
    await withTimeout(handler(job.data), JOB_TIMEOUT_MS, name);
  },
  {
    connection: createRedisConnection() as unknown as ConnectionOptions,
    concurrency: CONCURRENCY,
  },
);

void recoverStuckPublications();

// Free space taken by accumulated debug screenshots/HTML in the DB-fallback
// storage. During testing these can fill a small DB (Neon 512 MB) and block all
// writes. On boot we purge every debug blob; runtime keeps only a recent few.
void (async () => {
  try {
    const removed = await pruneDebugBlobs(0);
    if (removed > 0) {
      // eslint-disable-next-line no-console
      console.log(`🧹 Purged ${removed} debug blob(s) to free database space.`);
    }
  } catch {
    /* non-fatal */
  }
})();

worker.on("completed", (job) => {
  void logActivity({
    level: "INFO",
    message: `Task ${job.name} completed`,
    userId: job.data.userId,
    listingId: job.data.listingId,
    portalKey: job.data.portalKey,
  });
});

worker.on("failed", async (job, err) => {
  if (!job) return;
  // Only mark the publication as errored once retries are exhausted.
  const exhausted = job.attemptsMade >= (job.opts.attempts ?? 1);
  await logActivity({
    level: "ERROR",
    message: `Task ${job.name} failed (attempt ${job.attemptsMade})${
      exhausted ? " — giving up" : " — will retry"
    }: ${err.message}`,
    userId: job.data.userId,
    listingId: job.data.listingId,
    portalKey: job.data.portalKey,
  });
  if (exhausted) {
    await markError(job.data.publicationId, err.message);
  }
});

// Kick off the periodic auto-refresh scheduler alongside the worker.
const schedulerHandle = startScheduler();

// eslint-disable-next-line no-console
console.log(`👷 Worker started — queue="${QUEUE_NAME}" concurrency=${CONCURRENCY}`);

async function shutdown() {
  // eslint-disable-next-line no-console
  console.log("Shutting down worker…");
  clearInterval(schedulerHandle);
  await worker.close();
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
