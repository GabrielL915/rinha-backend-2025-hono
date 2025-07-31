import { getRedis } from '../config/redis';
import { PaymentData, ProcessorName, SummaryValue } from '../types';
import { fetchPaymentProcessor } from '../api/payment-processor';
import { canRequest, recordFailure, recordSuccess } from '../circuit-breaker';

export async function processPaymentWithCB(data: PaymentData, processor: ProcessorName, url: string) {
    if (!await canRequest(processor)) {
        return {
            success: false,
            error: `Circuit Breaker aberto para ${processor}`
        };
    }

    try {
        const result = await fetchPaymentProcessor(url, data);

        if (!result.success) {
            await recordFailure(processor);
            return result;
        }

        await recordSuccess(processor);
        return {
            correlationId: data.correlationId,
            amount: data.amount,
            requestedAt: data.requestedAt,
            processor: processor
        };
    } catch (error) {
        await recordFailure(processor);
        return {
            success: false,
            error: 'Erro ao processar pagamento'
        };
    }
}


export async function processPayment(data: PaymentData) {
    const redis = getRedis();

    const processorPayload = await redis.get('processor');
    if (!processorPayload) {
        return {
            success: false,
            error: 'No available payment processor'
        };
    }

    const { name: primaryProcessor, url: primaryUrl } = JSON.parse(processorPayload) as { name: ProcessorName; url: string };


    const fallback = primaryProcessor === 'default' ? 'fallback' : 'default';
    const fallbackUrl = fallback === 'default'
        ? process.env.PAYMENT_PROCESSOR_DEFAULT_URL as string
        : process.env.PAYMENT_PROCESSOR_FALLBACK_URL as string;

    const primaryResult = await processPaymentWithCB(data, primaryProcessor, primaryUrl);

    if (primaryResult.success) {
        return primaryResult;
    }

    return await processPaymentWithCB(data, fallback, fallbackUrl);
}

export async function savePaymentDataToRedis(data: PaymentData) {
    const redis = getRedis();
    await redis.lpush('payment', JSON.stringify(data));
}

async function getPaymentDataFromRedis() {
    const redis = getRedis();
    const raw = await redis.lrange('payment', 0, -1);
    return raw
        .map(item => {
            try { return JSON.parse(item) as PaymentData; }
            catch { return null; }
        })
        .filter((p): p is PaymentData => !!p);
}

export async function paymentSummary(from?: string, to?: string) {
    const payments = await getPaymentDataFromRedis();

    const fromTs = from ? Date.parse(from) : -Infinity;
    const toTs = to ? Date.parse(to) : Infinity;

    const summary: Record<ProcessorName, SummaryValue> = {
        default: { totalRequests: 0, totalAmount: 0 },
        fallback: { totalRequests: 0, totalAmount: 0 }
    };

    for (const p of payments) {
        const ts = Date.parse(p.requestedAt);
        if (ts < fromTs || ts > toTs) continue;

        if (p.processor === 'default' || p.processor === 'fallback') {
            summary[p.processor].totalRequests += 1;
            summary[p.processor].totalAmount += p.amount;
        }
    }

    return summary;

}
