import { getRedis } from '../config/redis';
import { PaymentData, ProcessorName, SummaryValue } from '../types';
import { fetchPaymentProcessor } from '../api/payment-processor';

const ZSET_KEY = 'payments_by_time';

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
    const ts = Date.parse(data.requestedAt);
    const hashKey = `payment:${data.correlationId}`;

    const pipeline = redis.pipeline();
    pipeline.hset(hashKey, {
        correlationId: data.correlationId,
        amount: data.amount.toString(),
        processor: data.processor,
        requestedAt: data.requestedAt
    });
    pipeline.zadd(ZSET_KEY, ts, data.correlationId);
    pipeline.publish('payment:done', data.correlationId);
    await pipeline.exec();
}

/* async function getPaymentDataFromRedis() {
    const redis = getRedis();
    const raw = await redis.lrange('payment', 0, -1);
    return raw
        .map(item => {
            try { return JSON.parse(item) as PaymentData; }
            catch { return null; }
        })
        .filter((p): p is PaymentData => !!p);
} */

export async function paymentSummary(from?: string, to?: string) {
    /* const payments = await getPaymentDataFromRedis();

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
 */
    const redis = getRedis();
    const fromTs = from ? Date.parse(from) : -Infinity;
    const toTs = to ? Date.parse(to) : Infinity;

    const maxTs = Number.isFinite(toTs) ? toTs - 1 : toTs;
    const ids = await redis.zrangebyscore(ZSET_KEY, fromTs, maxTs);

    if (ids.length === 0) {
        return {
            default: { totalRequests: 0, totalAmount: 0 },
            fallback: { totalRequests: 0, totalAmount: 0 }
        };
    }

    const p = redis.pipeline();
    ids.forEach(id => p.hgetall(`payment:${id}`));
    const execRes = await p.exec();

    if (!execRes) {
        return {
            default: { totalRequests: 0, totalAmount: 0 },
            fallback: { totalRequests: 0, totalAmount: 0 }
        };
    }

    const raws: Record<string, string>[] = [];
    for (const [err, data] of execRes) {
        if (err || !data) continue;
        raws.push(data as Record<string, string>);
    }

    const summary: Record<ProcessorName, SummaryValue> = {
        default: { totalRequests: 0, totalAmount: 0 },
        fallback: { totalRequests: 0, totalAmount: 0 }
    };

    for (const data of raws) {
        if (!data.processor) continue;
        
        const amount = Number(data.amount);
        if (isNaN(amount)) continue;

        const proc = data.processor as ProcessorName;
        
        if (!summary[proc]) {
            summary[proc] = { totalRequests: 0, totalAmount: 0 };
        }

        summary[proc].totalRequests++;
        summary[proc].totalAmount += amount;
    }

    return summary;
}