import type { JobType } from "@prisma/client";

// ===========================================================================
// Queue job contracts
//
// Every async portal operation flows through a single BullMQ queue. The job
// `name` selects the processor; the `data` payload carries just enough to
// rehydrate everything else from the database inside the worker.
// ===========================================================================

export const QUEUE_NAME = "portal-tasks";

/** Job names map 1:1 to the Provider interface verbs. */
export type TaskName = Lowercase<JobType>; // "publish" | "update" | "refresh" | "delete" | "check_status"

export interface BaseJobData {
  /** The Publication this task acts on. */
  publicationId: string;
  /** Denormalised for logging/scoping without an extra query. */
  userId: string;
  listingId: string;
  portalKey: string;
}

export type PublishJobData = BaseJobData;
export type UpdateJobData = BaseJobData;
export type RefreshJobData = BaseJobData;
export type DeleteJobData = BaseJobData;
export type CheckStatusJobData = BaseJobData;

export type AnyJobData = BaseJobData;

/** Default retry/backoff policy — tolerant of flaky portals & rate limits. */
export const DEFAULT_JOB_OPTS = {
  attempts: 4,
  backoff: { type: "exponential" as const, delay: 15_000 },
  removeOnComplete: { age: 60 * 60 * 24, count: 1000 },
  removeOnFail: { age: 60 * 60 * 24 * 7 },
};
