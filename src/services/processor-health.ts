const healthCache: Record<string, { status: boolean, lastCheck: number }> = {}

type HealthResponse = {
    failing: boolean,
    minResponseTime: number
}

export async function isProcessorHealthy(url: string): Promise<boolean> {
    const now = Date.now()
    const last = healthCache[url]?.lastCheck || 0

    if (now - last < 5000 && healthCache[url]) {
        return healthCache[url].status
    }

    try {
        const res = await fetch(`${url}/payments/service-health`)
        const json = await res.json() as HealthResponse
        const healthy = !json.failing
        healthCache[url] = { status: healthy, lastCheck: now }
        return healthy
    } catch {
        healthCache[url] = { status: false, lastCheck: now }
        return false
    }
}