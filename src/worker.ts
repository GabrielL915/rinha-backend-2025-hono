import Redis from 'ioredis'

const {
    REDIS_URI,
    REDIS_HOST = 'localhost',
    REDIS_PORT = '6379',
} = process.env

const connectionString =
    REDIS_URI ?? `redis://${REDIS_HOST}:${REDIS_PORT}`

const redis = new Redis(connectionString)

redis.on('connect', () => console.log('[Redis] connected'))
redis.on('ready', () => console.log('[Redis] ready to use'))
redis.on('error', (err) => console.error('[Redis] connection or command error:', err))
redis.on('close', () => console.warn('[Redis] connection closed'))
redis.on('reconnecting', (delay: number) =>
  console.log(`[Redis] reconnecting in ${delay}ms`)
)
redis.on('end', () => console.log('[Redis] connection ended'))


const DEFAULT_URL = 'http://localhost:8001/payments'
const FALLBACK_URL = 'http://localhost:8002/payments'
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function runWorker() {
    console.log('[Worker] started...')
    while (true) {
        try {
            const itemRaw = await redis.rpop('payment_queue')
            if (!itemRaw) {
                await sleep(50)
                continue
            }
            const item = JSON.parse(itemRaw)
            const now = new Date().toISOString()
            let success = await trySend(DEFAULT_URL, item, now)
            if (success) {
                console.log(`[worker] default payment ${item.correlationId}`)
                await redis.hincrby('summary:requests', 'default', 1)
                await redis.hincrbyfloat('summary:amount', 'default', item.amount)
            } else {
                // tenta fallback
                success = await trySend(FALLBACK_URL, item, now)
                if (success) {
                    console.log(`[worker] fallback payment ${item.correlationId}`)
                    await redis.hincrby('summary:requests', 'fallback', 1)
                    await redis.hincrbyfloat('summary:amount', 'fallback', item.amount)
                } else {
                    // reenfileira
                    await redis.lpush('payment_queue', JSON.stringify(item))
                }
            }
        } catch (err) {
            console.error('[worker] unexpected error:', err)
            await sleep(100)
        }
    }
}

async function trySend(url: string, item: any, requestedAt: string): Promise<boolean> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 3000)
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...item, requestedAt }),
            signal: controller.signal
        })
        return res.ok
    } catch (err) {
        console.warn(`[worker] failed to send to ${url}:`, err)
        return false
    } finally {
        clearTimeout(timeoutId)
    }
}

runWorker()
