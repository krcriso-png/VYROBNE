import { Queue, QueueEvents, type ConnectionOptions } from "bullmq";
import { createRedisConnection } from "../redis";

// BullMQ bundles its own copy of ioredis; an instance from our top-level
// ioredis is structurally compatible but nominally distinct, so we narrow it
// to BullMQ's ConnectionOptions at the boundary.
const connection = (): ConnectionOptions =>
  createRedisConnection() as unknown as ConnectionOptions;
import {
  QUEUE_NAME,
  DEFAULT_JOB_OPTS,
  type BaseJobData,
  type TaskName,
} from "./types";

// ===========================================================================
// Producer side of the queue.
//
// API routes / cron use these helpers to enqueue work. The worker process
// (src/worker) consumes it. The queue is sized to handle hundreds of jobs at
// once; concurrency is configured on the worker.
// ===========================================================================

const globalForQueue = globalThis as unknown as { portalQueue?: Queue };

export const portalQueue: Queue<BaseJobData> =
  globalForQueue.portalQueue ??
  new Queue<BaseJobData>(QUEUE_NAME, {
    connection: connection(),
    defaultJobOptions: DEFAULT_JOB_OPTS,
  });

if (process.env.NODE_ENV !== "production") {
  globalForQueue.portalQueue = portalQueue;
}

export interface EnqueueOptions {
  /** Delay in milliseconds before the job becomes available. */
  delayMs?: number;
  /** Stable job id for idempotency / de-duplication. */
  jobId?: string;
}

/** Enqueue a single portal task. */
export async function enqueueTask(
  name: TaskName,
  data: BaseJobData,
  opts: EnqueueOptions = {},
) {
  return portalQueue.add(name, data, {
    delay: opts.delayMs,
    jobId: opts.jobId,
  });
}

/** Enqueue the same task across many publications (e.g. "publish everywhere"). */
export async function enqueueBatch(name: TaskName, items: BaseJobData[]) {
  return portalQueue.addBulk(
    items.map((data) => ({ name, data })),
  );
}

/** Lightweight event stream — handy for live dashboards / SSE. */
export function createQueueEvents(): QueueEvents {
  return new QueueEvents(QUEUE_NAME, { connection: connection() });
}

export { QUEUE_NAME } from "./types";
