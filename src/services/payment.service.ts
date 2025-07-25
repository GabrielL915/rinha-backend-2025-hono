import { getRedis } from '../config/redis';
import { PaymentData, ProcessorConfig } from '../types';
import { PROCESSORS } from '../config/processors';
import { processorHealthService } from './processor-health';

class PaymentService {
    private get redis() {
        return getRedis()
    }

    async processPayment(data: PaymentData): Promise<{
        success: boolean;
        processor?: string;
        error?: string;
    }> {
        const now = new Date().toISOString();
        const paymentData = { ...data, requestedAt: now };

        const selectedProcessor = await processorHealthService.selectBestProcessor(PROCESSORS);

        if (!selectedProcessor) {
            return {
                success: false,
                error: 'No processors available'
            };
        }

        const result = await this.callProcessor(selectedProcessor, paymentData);

        if (result.success) {
            return {
                success: true,
                processor: selectedProcessor.name,
            };
        }
        return result;
    }

    private async callProcessor(processor: ProcessorConfig, data: PaymentData): Promise<{
        success: boolean;
        error?: string;
    }> {
        let lastError: string = '';
        for (let attempt = 0; attempt <= processor.retryCount; attempt++) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), processor.timeout);

                const res = await fetch(`${processor.url}/payments`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data),
                    signal: controller.signal
                });

                clearTimeout(timeoutId);

                if (res.ok) {
                    await this.updateMetrics(processor, data.correlationId, data.amount, data.requestedAt);
                    return { success: true };
                }

                lastError = `HTTP ${res.status}: ${res.statusText}`;

                if (res.status >= 400 && res.status < 500) {
                    break;
                }

            } catch (error) {
                lastError = error instanceof Error ? error.message : 'Unknown error';

                if (attempt < processor.retryCount && !lastError.includes('abort')) {
                    await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
                }
            }
        }

        return {
            success: false,
            error: lastError
        };
    }

    private async updateMetrics(processor: ProcessorConfig, correlationId: string, amount: number, requestedAt: string) {

        const keyReqs = 'summary:requests';
        const keyAmts = 'summary:amount';
        const keyZset = `summary:payments:${processor.name}`;
        const score = Date.parse(requestedAt)
        const memberData = JSON.stringify({ correlationId, amount, requestedAt })

        try {
            const pipeline = this.redis.pipeline();

            pipeline.hincrby(keyReqs, processor.name, 1);
            pipeline.hincrbyfloat(keyAmts, processor.name, amount);
            pipeline.zadd(keyZset, score, memberData);

            await pipeline.exec();

        } catch (error) {
            throw error;
        }
    }
}

export const paymentService = new PaymentService();