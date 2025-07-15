import Redis from 'ioredis'

export const REDIS_URI = process.env.REDIS_URI
export const REDIS_HOST = process.env.REDIS_HOST ?? 'localhost'
export const REDIS_PORT = process.env.REDIS_PORT ?? '6379'

export const redisConnectionConfig = {
    host: REDIS_HOST,
    port: parseInt(REDIS_PORT, 10),
    ...(REDIS_URI ? { url: REDIS_URI } : {})
}
const connectionString =
    REDIS_URI ??
    `redis://${REDIS_HOST}:${REDIS_PORT}`

let redisInstance: Redis | null = null

function createRedisConnection(): Redis {
    return new Redis(connectionString, {
        lazyConnect: true,
    })
}

function setupRedisEventListeners(redis: Redis) {
    redis.on('connect', () => console.log('[Redis] connected'))
    redis.on('ready', () => console.log('[Redis] ready to use'))
    redis.on('error', (err) => console.error('[Redis] connection or command error:', err))
    redis.on('close', () => console.warn('[Redis] connection closed'))
    redis.on('reconnecting', (delay: number) =>
        console.log(`[Redis] reconnecting in ${delay}ms`)
    )
    redis.on('end', () => console.log('[Redis] connection ended'))
}

export async function initializeRedis(): Promise<Redis> {
    if (redisInstance) return redisInstance

    const redis = createRedisConnection()
    setupRedisEventListeners(redis)

    try {
        console.log('[Redis] started...')
        await redis.connect()

        const pong = await redis.ping()
        if (pong !== 'PONG') {
            throw new Error(`Unexpected ping: ${pong}`)
        }

        console.log('[Redis] ping OK, connection established')
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
    console.log('[Redis] closing connection...')
    await redisInstance.quit()
    redisInstance = null
}

export function getRedis(): Redis {
    if (!redisInstance) {
        throw new Error('Redis has not been initialized. Call initializeRedis() first.')
    }
    return redisInstance
}
