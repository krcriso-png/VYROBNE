import "dotenv/config";
import { Worker, type Job, type ConnectionOptions } from "bullmq";
import { createRedisConnection } from "../lib/redis";
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

// ===========================================================================
// Worker entrypoint
//
// A standalone process (run separately from the Next.js app — see
// docker-compose) that consumes the portal-tasks queue. Concurrency lets it
// process many portals in parallel; BullMQ handles retries/backoff per the
// job options. Designed to scale horizontally: run N replicas of this process.
// ===========================================================================

const CONCURRENCY = Number(process.env.WORKER_CONCURRENCY ?? 10);

const handlers: Record<TaskName, (data: BaseJobData) => Promise<void>> = {
  publish: runPublish,
  update: runUpdate,
  refresh: runRefresh,
  delete: runDelete,
  check_status: runCheckStatus,
};

const worker = new Worker<BaseJobData>(
  QUEUE_NAME,
  async (job: Job<BaseJobData>) => {
    const name = job.name as TaskName;
    const handler = handlers[name];
    if (!handler) throw new Error(`No handler for job "${job.name}"`);
    await handler(job.data);
  },
  {
    connection: createRedisConnection() as unknown as ConnectionOptions,
    concurrency: CONCURRENCY,
  },
);

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
