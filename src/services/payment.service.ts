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

async function getPaymentDataFromRedis(pattern: string = 'payment:*') {
    const redis = getRedis();
    const results: PaymentData[] = [];
    
    try {
        let cursor = '0';
        
        do {
            const [nextCursor, keys] = await redis.scan(
                cursor, 
                'MATCH', pattern, 
                'COUNT', 1000 
            );
            
            cursor = nextCursor;
            
            if (keys.length > 0) {
                const pipeline = redis.pipeline();
                keys.forEach(key => pipeline.hgetall(key));
                
                const responses = await pipeline.exec();
                
                if (responses) {
                    for (const [err, data] of responses) {
                        if (err || !data) continue;
                        
                        const paymentData = data as Record<string, string>;
                        
                        if (paymentData.correlationId && paymentData.amount) {
                            results.push({
                                correlationId: paymentData.correlationId,
                                amount: parseInt(paymentData.amount, 10),
                                requestedAt: paymentData.requestedAt as string,
                                processor: paymentData.processor
                            });
                        }
                    }
                }
            }
            
        } while (cursor !== '0');
        
        return results;
    } catch (error) {
        console.error('Erro no scan Redis:', error);
        return [];
    }
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
