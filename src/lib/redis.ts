import IORedis, { type Redis } from "ioredis";

// A shared ioredis connection factory. BullMQ requires
// `maxRetriesPerRequest: null` for its blocking commands, so we configure that
// here. Connections are created lazily (never at module import) so that the
// inline/demo mode and the Edge runtime never open a Redis socket.
const globalForRedis = globalThis as unknown as { redis?: Redis };

export function createRedisConnection(): Redis {
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error("REDIS_URL is not set");
  }
  return new IORedis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
}

/** Lazily-created shared connection for ad-hoc use (not the queue/worker). */
export function getRedis(): Redis {
  if (!globalForRedis.redis) {
    globalForRedis.redis = createRedisConnection();
  }
  return globalForRedis.redis;
}
