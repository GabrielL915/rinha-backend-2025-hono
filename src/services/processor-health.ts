const healthCache: Record<string, { status: boolean, lastCheck: number }> = {}

type HealthResponse = {
    failing: boolean,
    minResponseTime: number
}

export async function isProcessorHealthy(url: string): Promise<boolean> {
    const now = Date.now()
    const last = healthCache[url]?.lastCheck || 0

    if (now - last < 5000 && healthCache[url]) {
        console.log(`[HealthCheck] Cache HIT para ${url} (status=${healthCache[url].status}) em ${(new Date(last)).toISOString()}`)
        return healthCache[url].status
    }

    try {
        const res = await fetch(`${url}/payments/service-health`)
        const json = await res.json() as HealthResponse
        const healthy = !json.failing
        healthCache[url] = { status: healthy, lastCheck: now }
        console.log(`[HealthCheck] Cache MISS para ${url}. Novo status=${healthy} em ${(new Date(now)).toISOString()}`)
        return healthy
    } catch (err) {
        healthCache[url] = { status: false, lastCheck: now }
        console.warn(`[HealthCheck] Erro ao checar health de ${url} em ${(new Date(now)).toISOString()}:`, err)
        return false
    }
}
