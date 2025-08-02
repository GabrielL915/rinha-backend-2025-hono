import { getRedis } from '../config/redis';
import { PaymentData, ProcessorName, SummaryValue } from '../types';
import { fetchPaymentProcessor } from '../api/payment-processor';


export async function processPayment(data: PaymentData) {
    const redis = getRedis();

    const processorPayload = await redis.get('processor');
    if (!processorPayload) {
        throw new Error('No available payment processor');
    }

    const { name: processor, url } = JSON.parse(processorPayload) as { name: ProcessorName; url: string };

    if (!url) {
        throw new Error('No available payment processor');
    }
    const result = await fetchPaymentProcessor(url, data);

    if (!result.success) {
        throw new Error(result.error || 'Payment processor error');
    }

    return {
        correlationId: data.correlationId,
        amount: data.amount,
        requestedAt: data.requestedAt,
        processor: processor
    }
}

export async function savePaymentDataToRedis(data: PaymentData) {
    /* const redis = getRedis();
    await redis.lpush('payment', JSON.stringify(data)); */
    const redis = getRedis();
    const keySet = `payments:${data.processor}`;
    const keyHash = `payments:data`;
    const ts = Date.parse(data.requestedAt);

    await redis
        .multi()
        .zadd(keySet, ts, data.correlationId)
        .hset(keyHash, data.correlationId, data.amount.toString())
        .exec();
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

/* export async function paymentSummary(from?: string, to?: string) {
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

} */
export async function paymentSummary(from?: string, to?: string) {
  const redis = getRedis();
  const fromTs = from ? Date.parse(from) : -Infinity;
  const toTs   = to   ? Date.parse(to)   : Infinity;

  const summary: Record<ProcessorName, SummaryValue> = {
    default:  { totalRequests: 0, totalAmount: 0 },
    fallback: { totalRequests: 0, totalAmount: 0 },
  };

  for (const processor of ['default','fallback'] as ProcessorName[]) {
    const setKey = `payments:${processor}`;
    const hashKey = `payments:data`;

    const ids: string[] = await redis.zrangebyscore(setKey, fromTs, toTs);

    if (ids.length === 0) continue;
    summary[processor].totalRequests = ids.length;

    // 2) obtém todos os amounts de uma vez
    const amounts = await redis.hmget(hashKey, ...ids);
    // hmget retorna array de string|null
    summary[processor].totalAmount = amounts
      .filter((a): a is string => !!a)
      .reduce((acc, str) => acc + parseFloat(str), 0);
  }

  return summary;
}