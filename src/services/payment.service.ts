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

        //console.log(`[PaymentService] Starting payment processing for correlationId: ${data.correlationId}`);

        const selectedProcessor = await processorHealthService.selectBestProcessor(PROCESSORS);

        if (!selectedProcessor) {
            //console.warn(`[PaymentService] No processors available for correlationId: ${data.correlationId}`);

            return {
                success: false,
                error: 'No processors available'
            };
        }

        //console.log(`[PaymentService] Selected processor: ${selectedProcessor.name} for correlationId: ${data.correlationId}`);

        const result = await this.callProcessor(selectedProcessor, paymentData);

        if (result.success) {
            //console.log(`[PaymentService] Payment successful via ${selectedProcessor.name} for correlationId: ${data.correlationId}, calling updateMetrics...`);

            return {
                success: true,
                processor: selectedProcessor.name,
            };
        }

        //console.warn(`[PaymentService] Payment failed via ${selectedProcessor.name} for correlationId: ${data.correlationId}: ${result.error}`);

        return result;
    }

    private async callProcessor(processor: ProcessorConfig, data: PaymentData): Promise<{
        success: boolean;
        error?: string;
    }> {
        let lastError: string = '';

        //console.log(`[PaymentService] Calling processor ${processor.name} (${processor.url}) for correlationId: ${data.correlationId}`);

        for (let attempt = 0; attempt <= processor.retryCount; attempt++) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), processor.timeout);

                //console.log(`[PaymentService] Attempt ${attempt + 1}/${processor.retryCount + 1} to ${processor.name} for correlationId: ${data.correlationId}`);

                const res = await fetch(`${processor.url}/payments`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data),
                    signal: controller.signal
                });

                clearTimeout(timeoutId);

                if (res.ok) {
                    //console.log(`[PaymentService] Success on attempt ${attempt + 1} to ${processor.name} for correlationId: ${data.correlationId}`);
                    await this.updateMetrics(processor,data.correlationId, data.amount, data.requestedAt);
                    return { success: true };
                }

                lastError = `HTTP ${res.status}: ${res.statusText}`;
                //console.warn(`[PaymentService] HTTP error on attempt ${attempt + 1} to ${processor.name} for correlationId: ${data.correlationId}: ${lastError}`);

                if (res.status >= 400 && res.status < 500) {
                    //console.log(`[PaymentService] Client error (4xx), not retrying for correlationId: ${data.correlationId}`);
                    break;
                }

            } catch (error) {
                lastError = error instanceof Error ? error.message : 'Unknown error';
                console.error(`[PaymentService] Exception on attempt ${attempt + 1} to ${processor.name} for correlationId: ${data.correlationId}:`, lastError);

                if (attempt < processor.retryCount && !lastError.includes('abort')) {
                    await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
                    console.log(`[PaymentService] Retrying in for correlationId: ${data.correlationId}`);
                }
            }
        }
        console.error(`[PaymentService] All attempts failed for ${processor.name}, correlationId: ${data.correlationId}, final error: ${lastError}`);

        return {
            success: false,
            error: lastError
        };
    }

    private async updateMetrics(processor: ProcessorConfig,correlationId: string, amount: number, requestedAt: string) {

        const keyReqs = 'summary:requests';
        const keyAmts = 'summary:amount';
        const keyZset = `summary:payments:${processor.name}`;
        const score = Date.parse(requestedAt)
        const memberData = JSON.stringify({ correlationId,amount, requestedAt })

        //console.log(`[UpdateMetrics] Updating metrics for processor: ${processor.name}`);
       // console.log(`[UpdateMetrics] ZSET key: ${keyZset}, Score: ${score}, Amount: ${amount}`);

        const pipeline = this.redis.pipeline();

        try {
            const pipeline = this.redis.pipeline();

            pipeline.hincrby(keyReqs, processor.name, 1);
            pipeline.hincrbyfloat(keyAmts, processor.name, amount);
            pipeline.zadd(keyZset, score, memberData);

            const results = await pipeline.exec();

            // Check if all pipeline commands succeeded
            let allSucceeded = true;
            results?.forEach((result, index) => {
                if (result[0] !== null) { // result[0] is the error
                   // console.error(`[UpdateMetrics] Pipeline command ${index} failed:`, result[0]);
                    allSucceeded = false;
                }
            });

            if (allSucceeded) {
               // console.log(`[UpdateMetrics] Successfully updated metrics for ${processor.name}`);

                // Verify the data was stored
                const count = await this.redis.zcard(keyZset);
                //console.log(`[UpdateMetrics] Current count in ${keyZset}: ${count}`);
            } else {
                throw new Error('Some pipeline commands failed');
            }
        } catch (error) {
            console.error(`[UpdateMetrics] Failed to update metrics for ${processor.name}:`, error);
            throw error; // Re-throw to let the caller know
        }
    }
}

export const paymentService = new PaymentService();