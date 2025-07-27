import { getRedis } from '../config/redis';
import { PaymentData, ProcessorName } from '../types';
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


//summary