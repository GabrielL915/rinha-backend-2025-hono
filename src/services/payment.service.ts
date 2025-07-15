import { getRedis } from '../config/redis'
import { isProcessorHealthy } from './processor-health'

const DEFAULT_URL = 'http://localhost:8001/payments'
const FALLBACK_URL = 'http://localhost:8002/payments'

export async function processPayment(data: { correlationId: string, amount: number }) {
    const now = new Date().toISOString()
    const redis = getRedis()

    const canUseDefault = await isProcessorHealthy(DEFAULT_URL)
    const canUseFallback = await isProcessorHealthy(FALLBACK_URL)

    let url = ''
    if (canUseDefault) {
        url = DEFAULT_URL
    } else if (canUseFallback) {
        url = FALLBACK_URL
    }

    if (!url) {
        return false
    }

    const res = await fetch(url + '/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, requestedAt: now })
    })

    if (!res.ok) {
        return false
    }

    const processor = url === DEFAULT_URL ? 'default' : 'fallback'
    await redis.hincrby('summary:requests', processor, 1)
    await redis.hincrbyfloat('summary:amount', processor, data.amount)

    return true
}
