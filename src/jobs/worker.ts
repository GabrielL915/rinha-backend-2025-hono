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
        const data = job.data;
        return await processPayment(data);

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