import { Worker } from "bullmq";
import { redisConnectionConfig } from "../config/redis";
import { processPayment, savePaymentDataToRedis } from "../services/payment.service";
import { paymentProcessorHealthCheck } from "../services/health.service";
import { PaymentData } from "../types";
import { paymentQueue } from "./queue";

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
                    delay: 2000
                });
                return { requeued: true };
            }
            // para outros erros, lança pra BullMQ aplicar retry/backoff
            throw error;
        }
    }, {
        connection: redisConnectionConfig,
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
        connection: redisConnectionConfig,
        concurrency: 1,
    }
    )
}