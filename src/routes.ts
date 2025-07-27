import { Hono } from 'hono'
import { getRedis } from './config/redis'
import { PROCESSORS, ADMIN_PURGE_PATH, RINHA_TOKEN } from './config/processors'

const DEFAULT_PROCESSOR = process.env.PAYMENT_PROCESSOR_DEFAULT_URL
const FALLBACK_PROCESSOR = process.env.PAYMENT_PROCESSOR_FALLBACK_URL

export const paymentsRoute = new Hono()

paymentsRoute.post('/payments', async c => {
    //cria timestamp
    const redis = getRedis()
    const body = await c.req.json()

})

// OTIMIZAÇÃO: Summary endpoint com cache mais eficiente
paymentsRoute.get('/payments-summary', async c => {
    const redis = getRedis()
    
    const fromParam = c.req.query('from')
    const toParam = c.req.query('to')
    const fromTs = fromParam ? Date.parse(fromParam) : 0
    const toTs = toParam ? Date.parse(toParam) : Date.now()
    
    const cacheKey = `${fromTs}-${toTs}`
    const cached = summaryCache.get(cacheKey)
    
    if (cached && (Date.now() - cached.timestamp) < SUMMARY_CACHE_TTL) {
        return c.json(cached.data)
    }

    try {
        // Pipeline Redis otimizado
        const pipeline = redis.pipeline()
        
        PROCESSORS.forEach(processor => {
            pipeline.zrangebyscore(`summary:payments:${processor.name}`, fromTs, toTs)
        })
        
        const results = await pipeline.exec()
        
        if (!results) {
            throw new Error('Pipeline execution failed')
        }

        const response: Record<string, { totalRequests: number, totalAmount: number }> = {}
        
        // Processamento otimizado
        results.forEach((result, index) => {
            const processor = PROCESSORS[index]
            const members = result[1] as string[]
            
            let totalAmount = 0
            const totalRequests = members.length
            
            // OTIMIZAÇÃO: Early exit se não há dados
            if (totalRequests === 0) {
                if (processor && processor.name) {
                    response[processor.name] = { totalRequests: 0, totalAmount: 0 }
                } else {
                    response[`unknown_processor_${index}`] = { totalRequests: 0, totalAmount: 0 }
                }
                return
            }
            
            for (const member of members) {
                try {
                    const { amount } = JSON.parse(member) as { amount: number }
                    totalAmount += amount
                } catch {
                    // Ignore invalid members silently
                }
            }
            
            if (processor && processor.name) {
                response[processor.name] = { totalRequests, totalAmount }
            } else {
                response[`unknown_processor_${index}`] = { totalRequests, totalAmount }
            }
        })

        // Cache management otimizado
        summaryCache.set(cacheKey, { data: response, timestamp: Date.now() })
        
        // OTIMIZAÇÃO: Garbage collection mais agressivo
        if (summaryCache.size > MAX_CACHE_SIZE) {
            const keysToDelete = Array.from(summaryCache.keys()).slice(0, summaryCache.size - MAX_CACHE_SIZE)
            keysToDelete.forEach(key => summaryCache.delete(key))
        }

        return c.json(response)
        
    } catch (error) {
        console.error('[Summary] Error:', error)
        return c.json({ error: 'Failed to fetch summary' }, 500)
    }
})

paymentsRoute.post('/purge-payments', async (c) => {
    const redis = getRedis()
    summaryCache.clear()

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