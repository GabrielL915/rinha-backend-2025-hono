import Redis from 'ioredis'

export const REDIS_URI = process.env.REDIS_URI

export const redisConnectionConfig = new URL(REDIS_URI!)


let redisInstance: Redis | null = null

function createRedisConnection(): Redis {
    return new Redis({
        host: redisConnectionConfig.hostname,
        port: Number(redisConnectionConfig.port),
         maxRetriesPerRequest: 3,
        connectTimeout: 1500,
        commandTimeout: 3000,
        enableOfflineQueue: false,
        lazyConnect: true,
    })
}

function setupRedisEventListeners(redis: Redis) {
    redis.on('connect', () => {
        console.log('[Redis] connected successfully')
        /* healthCheckQueue.upsertJobScheduler(healthCheckQueue.name, {
            every: 5000
        }) */
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
