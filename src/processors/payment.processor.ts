import { Worker } from "bullmq";
import { redisConnectionConfig } from "../config/redis";
import { processPayment } from "../services/payment.service";
import { isProcessorHealthy } from "../services/processor-health";

const queueName = 'payment_queue'
const DEFAULT_URL = 'http://localhost:8001'
const FALLBACK_URL = 'http://localhost:8002'
const HEALTH_INTERVAL = 5000

export const startPaymentWorker = () => {
    const worker = new Worker(
        queueName,
        async job => {
            const { correlationId, amount } = job.data;
            console.log(`[Worker] Processing job ${job.id} - correlationId=${correlationId}, amount=${amount}`);
            const success = await processPayment(job.data)
            if (success) {
                console.log(`[Worker] Payment sent for correlationId=${correlationId}`);
            } else {
                console.warn(`[Worker] Processor unavailable for correlationId=${correlationId}, will retry later`);
            }
        },
        {
            connection: redisConnectionConfig,
            concurrency: 20,
            autorun: false
        }
    )

    worker.on('failed', (job, err) => {
        console.error(`[Worker] Job ${job?.id} failed:`, err)
    })

    worker.on('completed', (job) => {
        console.log(`[Worker] Job ${job.id} completed`)
    })

    setInterval(async () => {
        const defaultOk = await isProcessorHealthy(DEFAULT_URL)
        const fallbackOk = await isProcessorHealthy(FALLBACK_URL)

        if (!defaultOk && !fallbackOk) {
            if (!worker.isPaused()) {
                console.warn('[Worker] Pausing queue (no processors available)')
                await worker.pause()
            }
        } else {
            if (worker.isPaused()) {
                console.log('[Worker] Resuming queue (processor available)')
                worker.resume()
            }
        }
    }, HEALTH_INTERVAL)

    console.log('[Worker] initialized and health-check timer started')
}