import { Queue, QueueEvents, type ConnectionOptions } from "bullmq";
import { createRedisConnection } from "../redis";
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
//
// DEMO / inline mode: when INLINE_QUEUE=true there is no Redis and no separate
// worker — tasks run synchronously inside the request. This lets the app be
// deployed to platforms with no background workers (e.g. Vercel) for a quick
// trial. Production uses the real BullMQ queue (INLINE_QUEUE unset/false).
// ===========================================================================

const INLINE = process.env.INLINE_QUEUE === "true";

// BullMQ bundles its own copy of ioredis; an instance from our top-level
// ioredis is structurally compatible but nominally distinct, so we narrow it
// to BullMQ's ConnectionOptions at the boundary.
const connection = (): ConnectionOptions =>
  createRedisConnection() as unknown as ConnectionOptions;

const globalForQueue = globalThis as unknown as { portalQueue?: Queue };

/** The BullMQ queue — only constructed when NOT in inline mode (needs Redis). */
export const portalQueue: Queue<BaseJobData> | null = INLINE
  ? null
  : (globalForQueue.portalQueue ??
    new Queue<BaseJobData>(QUEUE_NAME, {
      connection: connection(),
      defaultJobOptions: DEFAULT_JOB_OPTS,
    }));

if (!INLINE && process.env.NODE_ENV !== "production" && portalQueue) {
  globalForQueue.portalQueue = portalQueue;
}

export interface EnqueueOptions {
  /** Delay in milliseconds before the job becomes available. */
  delayMs?: number;
  /** Stable job id for idempotency / de-duplication. */
  jobId?: string;
  /** Override the retry count (e.g. 1 for browser publishes with SMS). */
  attempts?: number;
}

/** Run a task immediately, in-process (inline/demo mode). */
async function runInline(name: TaskName, data: BaseJobData): Promise<void> {
  // Lazy import so the worker service (and its provider deps) is only loaded
  // when inline mode is actually used.
  const svc = await import("../../worker/service");
  const handlers: Record<TaskName, (d: BaseJobData) => Promise<void>> = {
    publish: svc.runPublish,
    update: svc.runUpdate,
    refresh: svc.runRefresh,
    delete: svc.runDelete,
    check_status: svc.runCheckStatus,
  };
  try {
    await handlers[name](data);
  } catch (err) {
    await svc.markError(data.publicationId, (err as Error).message);
  }
}

/** Enqueue a single portal task (or run it inline in demo mode). */
export async function enqueueTask(
  name: TaskName,
  data: BaseJobData,
  opts: EnqueueOptions = {},
) {
  if (INLINE || !portalQueue) {
    return runInline(name, data);
  }
  return portalQueue.add(name, data, {
    delay: opts.delayMs,
    jobId: opts.jobId,
    attempts: opts.attempts,
  });
}

/** Enqueue the same task across many publications (e.g. "publish everywhere"). */
export async function enqueueBatch(name: TaskName, items: BaseJobData[]) {
  if (INLINE || !portalQueue) {
    for (const data of items) await runInline(name, data);
    return;
  }
  return portalQueue.addBulk(items.map((data) => ({ name, data })));
}

/** Lightweight event stream — handy for live dashboards / SSE. */
export function createQueueEvents(): QueueEvents {
  return new QueueEvents(QUEUE_NAME, { connection: connection() });
}

export { QUEUE_NAME } from "./types";
