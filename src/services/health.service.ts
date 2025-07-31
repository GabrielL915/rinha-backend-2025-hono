import { HealthResponse, ChooseResult, ProcessorName } from "../types";
import { fetchPaymentProcessorHealth } from "../api/payment-processor";
import { getRedis } from "../config/redis";
import { recordSuccess } from "../circuit-breaker";

export async function paymentProcessorHealthCheck() {
    const redis = getRedis();
    const defaultProcessorUrl = process.env.PAYMENT_PROCESSOR_DEFAULT_URL as string;
    const fallbackProcessorUrl = process.env.PAYMENT_PROCESSOR_FALLBACK_URL as string;

    const [defaultRes, fallbackRes] = await Promise.all([
        fetchPaymentProcessorHealth(defaultProcessorUrl),
        fetchPaymentProcessorHealth(fallbackProcessorUrl)
    ]);

    if (!defaultRes.failing || !fallbackRes.failing) {
        const choice = choosePaymentProcessor(defaultRes, fallbackRes);

        if (choice.success) {
            await recordSuccess(choice.processor);
            const selectedUrl = choice.processor === 'default' ? defaultProcessorUrl : fallbackProcessorUrl;
            const payload = JSON.stringify({
                name: choice.processor,
                url: selectedUrl
            });
            await redis.set("processor", payload);
        } else {
            await redis.del("processor");
        }

        return choice;
    }

    return { success: false, processor: '' };

}


export function choosePaymentProcessor(defaultProcessor: HealthResponse, fallbackProcessor: HealthResponse): ChooseResult {
    const defaultResponseTime = 2.5
    const defaultHealthy = !defaultProcessor.failing;
    const fallbackHealthy = !fallbackProcessor.failing;

    if (!defaultHealthy && !fallbackHealthy) {
        return { success: false, error: 'No available payment processor' };
    }

    if (defaultHealthy && fallbackHealthy) {
        const ratio = defaultProcessor.minResponseTime / fallbackProcessor.minResponseTime;
        const pick: ProcessorName =
            ratio > defaultResponseTime ? 'fallback' : 'default';

        return { success: true, processor: pick };
    }

    if (defaultHealthy) {
        return { success: true, processor: 'default' };
    } else {
        return { success: true, processor: 'fallback' };
    }
}