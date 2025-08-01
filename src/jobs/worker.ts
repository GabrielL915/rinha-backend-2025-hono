import { Queue, Worker, Job } from "bullmq";
import { redisConnectionConfig } from "../config/redis";
import { processPayment, savePaymentDataToRedis } from "../services/payment.service";
import { paymentProcessorHealthCheck } from "../services/health.service";
import { PaymentData } from "../types";
import { getRedis } from "../config/redis";

const paymentqueueName = 'payment_queue';
const healthQueueName = 'health_queue';

export const startPaymentWorker = () => {
    const worker = new Worker(paymentqueueName, async (job: Job) => {
        const redis = getRedis();
        const data = job.data as PaymentData;

        const processor = await redis.get("processor");
        if (!processor) {
            await job.moveToDelayed(Date.now() + 1000);
            throw new Error("Nenhum processador disponível no momento");
        }

        const result = await processPayment(data);
        return result;

    }, {
        connection: {
            host: redisConnectionConfig.hostname,
            port: Number(redisConnectionConfig.port),
        },
        concurrency: 10,
       
    });

    worker.on('completed', async (job) => {
        const result = job.returnvalue as PaymentData;
        if (result) {
            await savePaymentDataToRedis(result);
        }
    });

    worker.on('failed', async (job, err) => {
        if (!job) return
        if (job.attemptsMade < (job.opts.attempts ?? 3)) {
            await job.moveToDelayed(Date.now() + 500);
        }
    });
};

export const startHealthWorker = () => {
    const worker = new Worker(healthQueueName, async () => {
        await paymentProcessorHealthCheck();
    }, {
        connection: {
            host: redisConnectionConfig.hostname,
            port: Number(redisConnectionConfig.port),
        },
        concurrency: 1,
    });
};

export function scheduleHealthChecks(queue: Queue) {
    queue.upsertJobScheduler(queue.name, { every: 5000 });
}
