import { Worker } from "bullmq";
import { redisConnectionConfig } from "../config/redis";
import { processPayment, savePaymentDataToRedis } from "../services/payment.service";
import { paymentProcessorHealthCheck } from "../services/health.service";

const paymentqueueName = 'payment_queue';
const healthQueueName = 'health_queue';

export const startPaymentWorker = () => {
    const worker = new Worker(paymentqueueName, async (job) => {
        const data = job.data;
        return await processPayment(data);
    }, {
        connection: redisConnectionConfig,
        concurrency: 10,
        autorun: false,
    }
    )

    worker.on('completed', async (job) => {
        const result = job.returnvalue;
        await savePaymentDataToRedis(result);
    });
}

export const startHealthWorker = () => {
    const worker = new Worker(healthQueueName, async () => {
        await paymentProcessorHealthCheck();
    }, {
        connection: redisConnectionConfig,
        concurrency: 1,
    }
    )
}