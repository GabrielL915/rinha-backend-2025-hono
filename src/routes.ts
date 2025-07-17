import { Hono } from 'hono'
import { getRedis } from './config/redis'
import { paymentQueue } from './jobs/payment.queue'

const DEFAULT_PROCESSOR = 'http://localhost:8001'
const FALLBACK_PROCESSOR = 'http://localhost:8002'
const ADMIN_PURGE_PATH = '/admin/purge-payments'
const RINHA_TOKEN = '123'

export const paymentsRoute = new Hono()

paymentsRoute.post('/payments', async c => {
    const redis = getRedis()
    const body = await c.req.json()
    if (!body.correlationId || typeof body.amount !== 'number' || body.amount <= 0) {
        return c.json({ error: 'Invalid input' }, 400)
    }

    const added = await redis.sadd('payments:ids', body.correlationId)
    if (added === 0) return c.json({ error: 'correlationId must be unique' }, 409)

    const data = {
        correlationId: body.correlationId,
        amount: body.amount
    }
    await paymentQueue.add('process-payment', data, {
        attempts: 5,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 100,
        removeOnFail: 50
    })

    return c.json({ status: 'enqueued' }, 202)
})

//TODO
paymentsRoute.get('/payments-summary', async c => {
    const redis = getRedis()

    const [reqs, amts] = await Promise.all([
        redis.hgetall('summary:requests'),
        redis.hgetall('summary:amount'),
    ])

    return c.json({
        default: {
            totalRequests: parseInt(reqs.default || '0'),
            totalAmount: parseFloat(amts.default || '0'),
        },
        fallback: {
            totalRequests: parseInt(reqs.fallback || '0'),
            totalAmount: parseFloat(amts.fallback || '0'),
        }
    })
})

paymentsRoute.post('/purge-payments', async (c) => {
    const redis = getRedis()

    const redisKeys = [
        'payment_queue',
        'payments:ids',
        'summary:requests',
        'summary:amount',
    ]
    await redis.del(...redisKeys)

    const results = await Promise.allSettled([
        fetch(DEFAULT_PROCESSOR + ADMIN_PURGE_PATH, {
            method: 'POST',
            headers: { 'X-Rinha-Token': RINHA_TOKEN },
        }),
        fetch(FALLBACK_PROCESSOR + ADMIN_PURGE_PATH, {
            method: 'POST',
            headers: { 'X-Rinha-Token': RINHA_TOKEN },
        }),
    ])
    const [defaultResult, fallbackResult] = results.map((r) => {
        if (r.status === 'fulfilled' && r.value.ok) {
            return { success: true }
        } else {
            return {
                success: false,
                error:
                    r.status === 'rejected'
                        ? r.reason.message
                        : `HTTP ${r.value.status}`,
            }
        }
    })

    return c.json({
        message: 'All data purged locally and on payment processors.',
        redis: { success: true },
        processorDefault: defaultResult,
        processorFallback: fallbackResult,
    })
})