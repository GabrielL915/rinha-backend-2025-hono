import { getRedis } from '../config/redis'
import { isProcessorHealthy } from './processor-health'

const DEFAULT_URL = 'http://localhost:8001'
const FALLBACK_URL = 'http://localhost:8002'

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
        console.warn(`[PaymentService] Nenhum processador disponível para correlationId=${data.correlationId}`)
        return false
    }

    console.log(`[PaymentService] Enviando pagamento para ${url}/payments com dados:`, { ...data, requestedAt: now })
    const res = await fetch(url + '/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, requestedAt: now })
    })
    console.log(`[PaymentService] Resposta do processador: status=${res.status} ok=${res.ok}`)

    if (!res.ok) {
        console.warn(`[PaymentService] Falha ao processar pagamento para correlationId=${data.correlationId}`)
        return false
    }

    const processor = url === DEFAULT_URL ? 'default' : 'fallback'
    // Log antes de atualizar o summary
    const [beforeRequests, beforeAmount] = await Promise.all([
        redis.hget('summary:requests', processor),
        redis.hget('summary:amount', processor)
    ])
    console.log(`[PaymentService] Antes do update summary: processor=${processor}, requests=${beforeRequests}, amount=${beforeAmount}`)

    // Usar pipeline para otimizar
    const pipeline = redis.pipeline()
    pipeline.hincrby('summary:requests', processor, 1)
    pipeline.hincrbyfloat('summary:amount', processor, data.amount)
    const execResult = await pipeline.exec()
    if (!execResult) {
        console.error('[PaymentService] Erro ao executar pipeline Redis')
    } else {
        const reqResult = execResult[0]
        const amtResult = execResult[1]
        if (reqResult && reqResult[0]) console.error('[PaymentService] Erro em hincrby:', reqResult[0])
        if (amtResult && amtResult[0]) console.error('[PaymentService] Erro em hincrbyfloat:', amtResult[0])
    }

    // Log depois de atualizar o summary
    const [afterRequests, afterAmount] = await Promise.all([
        redis.hget('summary:requests', processor),
        redis.hget('summary:amount', processor)
    ])
    console.log(`[PaymentService] Depois do update summary: processor=${processor}, requests=${afterRequests}, amount=${afterAmount}`)

    return true
}
