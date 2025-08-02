import { Queue, Worker } from "bullmq";
import { redisConnectionConfig } from "../config/redis";
import { processPayment, savePaymentDataToRedis } from "../services/payment.service";
import { paymentProcessorHealthCheck } from "../services/health.service";
import { PaymentData } from "../types";
import { paymentQueue } from "./queue";
import { getRedis } from "../config/redis";

const paymentqueueName = 'payment_queue';
const healthQueueName = 'health_queue';

export const startPaymentWorker = () => {
    const worker = new Worker(paymentqueueName, async (job) => {
        try {
            const data = job.data;
            return await processPayment(data);
        } catch (error) {
            if (typeof error === "object" && error !== null && "message" in error && (error as any).message === 'No available payment processor') {
                await paymentQueue.add(job.name, job.data, {
                    jobId: job.id,
                    delay: Number(process.env.REQUEUE_DELAY),
                });
                return { requeued: true };
            }
            // para outros erros, lança pra BullMQ aplicar retry/backoff
            throw error;
        }
    }, {
        connection: {
            host: redisConnectionConfig.hostname,
            port: Number(redisConnectionConfig.port),
        },
        concurrency: 10,
    }
    )

    worker.on('completed', async (job) => {
        const result = job.returnvalue as PaymentData
        await savePaymentDataToRedis(result);
    });

    worker.on('failed', () => {
        const redis = getRedis();
        redis.set("processor", "fallback")
    })
}

export const startHealthWorker = () => {
    const worker = new Worker(healthQueueName, async () => {
        await paymentProcessorHealthCheck();
    }, {
        connection: {
            host: redisConnectionConfig.hostname,
            port: Number(redisConnectionConfig.port),
        },
        concurrency: 1,
    }
    )
}

export function scheduleHealthChecks(queue: Queue) {
    queue.upsertJobScheduler(queue.name, { every: 5000 });
}