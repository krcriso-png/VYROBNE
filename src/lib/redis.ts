import IORedis, { type Redis } from "ioredis";

// A shared ioredis connection. BullMQ requires `maxRetriesPerRequest: null`
// for its blocking commands, so we configure that here and reuse the
// connection for both queues and workers.
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

export const redis: Redis = globalForRedis.redis ?? createRedisConnection();

if (process.env.NODE_ENV !== "production") {
  globalForRedis.redis = redis;
}
