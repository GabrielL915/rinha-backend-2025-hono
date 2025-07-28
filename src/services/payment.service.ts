import { getRedis } from '../config/redis';
import { PaymentData, ProcessorName, SummaryValue } from '../types';
import { fetchPaymentProcessor } from '../api/payment-processor';


export async function processPayment(data: PaymentData) {
    const redis = getRedis();

    const processorPayload = await redis.get('processor');
    if (!processorPayload) {
        return {
            success: false,
            error: 'No available payment processor'
        };
    }

    const { name: processor, url } = JSON.parse(processorPayload) as { name: ProcessorName; url: string };

    if (!url) {
        return {
            success: false,
            error: 'No available payment processor'
        };
    }
    const result = await fetchPaymentProcessor(url, data);

    if (!result.success) {
        return result
    }

    return {
        correlationId: data.correlationId,
        amount: data.amount,
        requestedAt: data.requestedAt,
        processor: processor
    }
}

export async function savePaymentDataToRedis(data: PaymentData) {
    const redis = getRedis();
    await redis.lpush('payment', JSON.stringify(data));
}

async function getPaymentDataFromRedis(redis: ReturnType<typeof getRedis>) {
    const raw = await redis.lrange('payment', 0, -1);
    const payments = raw.map(item => JSON.parse(item) as PaymentData);
    return payments;
}

export async function paymentSummary(from: string, to: string) {
    const redis = getRedis();
    const payments = await getPaymentDataFromRedis(redis);

    const fromTs = from ? Date.parse(from) : -Infinity;
    const toTs = to ? Date.parse(to) : Infinity;

    const summary: Record<ProcessorName, SummaryValue> = {
        default: { totalRequests: 0, totalAmount: 0 },
        fallback: { totalRequests: 0, totalAmount: 0 }
    };

    for (const payment of payments) {
        const requestedAt = Date.parse(payment.requestedAt);
        if (requestedAt < fromTs || requestedAt > toTs) {
            continue;
        }
        summary[payment.processor as ProcessorName].totalRequests++;
        summary[payment.processor as ProcessorName].totalAmount += payment.amount;
    }

    delete (summary as Record<string, SummaryValue>)[''];

    return summary;

}
