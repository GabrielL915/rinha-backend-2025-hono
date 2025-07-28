import { Hono } from 'hono'
import { getRedis } from './config/redis'
import { ADMIN_PURGE_PATH, RINHA_TOKEN } from './config/processors'
import { paymentQueue } from './jobs/queue'
import { PaymentData } from './types'
import { paymentSummary } from './services/payment.service'

const DEFAULT_PROCESSOR = process.env.PAYMENT_PROCESSOR_DEFAULT_URL
const FALLBACK_PROCESSOR = process.env.PAYMENT_PROCESSOR_FALLBACK_URL

export const paymentsRoute = new Hono()

paymentsRoute.post('/payments', async c => {
    const body = await c.req.json()

    const requestedAt = new Date().toISOString()
    const data: PaymentData = {
        ...body,
        requestedAt,
    }

    await paymentQueue.add('payment_queue', data, {
        jobId: body.correlationId,
        attempts: 3,
        backoff: {
            type: 'fixed',
            delay: 1000,
        },
    })
    return c.json({ status: 'queued' }, 202);
})

paymentsRoute.get('/payments-summary', async c => {
    const fromParam = c.req.query('from')
    const toParam = c.req.query('to')

    const summary = await paymentSummary(fromParam as string, toParam as string);

    return c.json({
        default: {
            totalRequests: summary.default.totalRequests,
            totalAmount: summary.default.totalAmount,
        },
        fallback: {
            totalRequests: summary.fallback.totalRequests,
            totalAmount: summary.fallback.totalAmount,
        },
    },
        200,);
})


paymentsRoute.post('/purge-payments', async (c) => {
    const redis = getRedis()

    await Promise.all([
        redis.del('payments'),
        redis.del('processor')
    ]);

    const results = await Promise.allSettled([
        fetch(DEFAULT_PROCESSOR + ADMIN_PURGE_PATH, {
            method: 'POST',
            headers: { 'X-Rinha-Token': RINHA_TOKEN },
            keepalive: false // OTIMIZAÇÃO: Evitar conexões persistentes
        }),
        fetch(FALLBACK_PROCESSOR + ADMIN_PURGE_PATH, {
            method: 'POST',
            headers: { 'X-Rinha-Token': RINHA_TOKEN },
            keepalive: false
        }),
    ])

    const [defaultResult, fallbackResult] = results.map((r) => {
        if (r.status === 'fulfilled' && r.value.ok) {
            return { success: true }
        } else {
            return {
                success: false,
                error: r.status === 'rejected' ? r.reason.message : `HTTP ${r.value.status}`,
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