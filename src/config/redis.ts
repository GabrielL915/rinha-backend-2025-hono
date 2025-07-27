import Redis from 'ioredis'
import { healthCheckQueue } from '../jobs/queue'

export const REDIS_URI = process.env.REDIS_URI
export const REDIS_HOST = process.env.REDIS_HOST ?? 'localhost'
export const REDIS_PORT = process.env.REDIS_PORT ?? '6379'

export const redisConnectionConfig = {
    url: REDIS_URI ?? `redis://${REDIS_HOST}:${REDIS_PORT}`,
    // OTIMIZAÇÃO: Configurações de retry otimizadas
    // maxRetriesPerRequest: 3,
    // retryDelayOnFailover: 100,
    // enableReadyCheck: true,
    // maxLoadingTimeout: 5000,
    lazyConnect: true,
}

let redisInstance: Redis | null = null

function createRedisConnection(): Redis {
    return new Redis(redisConnectionConfig)
}

function setupRedisEventListeners(redis: Redis) {
    redis.on('connect', () => {
        console.log('[Redis] connected successfully')
        healthCheckQueue.upsertJobScheduler(healthCheckQueue.name, {
            every: 5000
        })
    })
    redis.on('error', (err) => console.error('[Redis] connection or command error:', err))
    redis.on('close', () => console.warn('[Redis] connection closed'))
}

export async function initializeRedis(): Promise<Redis> {
    if (redisInstance) return redisInstance

    const redis = createRedisConnection()
    setupRedisEventListeners(redis)

    try {
        redisInstance = redis
        return redisInstance
    } catch (err) {
        console.error('[Redis] failed to connect:', err)
        try {
            await redis.quit()
        } catch {
            /* ignore */
        }
        throw err
    }
}

export async function closeRedis(): Promise<void> {
    if (!redisInstance) return
    await redisInstance.quit()
    redisInstance = null
}

export function getRedis(): Redis {
    if (!redisInstance) {
        throw new Error('Redis has not been initialized. Call initializeRedis() first.')
    }
    return redisInstance
}
