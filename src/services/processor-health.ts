import { ProcessorConfig, HealthResponse, HealthStatus } from '../types';
import { MAX_CONSECUTIVE_FAILURES, HEALTH_CACHE_TTL } from '../config/processors';

class ProcessorHealthService {
    private healthCache: Record<string, HealthStatus> = {};

    async isProcessorHealthy(processor: ProcessorConfig): Promise<boolean> {
        const now = Date.now();
        const cached = this.healthCache[processor.url];

        if (cached && (now - cached.lastCheck) < HEALTH_CACHE_TTL) {
            return cached.status && cached.consecutiveFailures < MAX_CONSECUTIVE_FAILURES;
        }

        return this.checkHealth(processor);
    }

    private async checkHealth(processor: ProcessorConfig): Promise<boolean> {
        const now = Date.now();
        const startTime = now;

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), processor.timeout);

            const res = await fetch(`${processor.url}/payments/service-health`, {
                signal: controller.signal,
                headers: { 'Content-Type': 'application/json' }
            });

            clearTimeout(timeoutId);

            if (!res.ok) {
                this.recordFailure(processor.url, now - startTime);
                return false;
            }

            const json = await res.json() as HealthResponse;
            const healthy = !json.failing;
            
            this.recordResult(processor.url, healthy, now - startTime);
            return healthy;

        } catch (error) {
            this.recordFailure(processor.url, now - startTime);
            return false;
        }
    }

    private recordResult(url: string, healthy: boolean, responseTime: number) {
        const existing = this.healthCache[url];
        
        this.healthCache[url] = {
            status: healthy,
            lastCheck: Date.now(),
            responseTime,
            consecutiveFailures: healthy ? 0 : (existing?.consecutiveFailures || 0) + 1
        };
    }

    private recordFailure(url: string, responseTime: number) {
        const existing = this.healthCache[url];
        
        this.healthCache[url] = {
            status: false,
            lastCheck: Date.now(),
            responseTime,
            consecutiveFailures: (existing?.consecutiveFailures || 0) + 1
        };
    }

    getHealthStatus(url: string): HealthStatus | null {
        return this.healthCache[url] || null;
    }

    async selectBestProcessor(processors: ProcessorConfig[]): Promise<ProcessorConfig | null> {
        const healthyProcessors: Array<{
            processor: ProcessorConfig;
            responseTime: number;
        }> = [];

        for (const processor of processors) {
            const isHealthy = await this.isProcessorHealthy(processor);
            if (isHealthy) {
                const healthStatus = this.getHealthStatus(processor.url);
                healthyProcessors.push({
                    processor,
                    responseTime: healthStatus?.responseTime || Infinity
                });
            }
        }

        if (healthyProcessors.length === 0) {
            return null;
        }

        healthyProcessors.sort((a, b) => {
            if (a.processor.priority !== b.processor.priority) {
                return a.processor.priority - b.processor.priority;
            }
            return a.responseTime - b.responseTime;
        });

        const bestProcessor = healthyProcessors[0];
        return bestProcessor ? bestProcessor.processor : null;
    }
}

export const processorHealthService = new ProcessorHealthService();