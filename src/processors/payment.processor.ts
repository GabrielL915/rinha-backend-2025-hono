import { Worker } from "bullmq";
import { redisConnectionConfig } from "../config/redis";
import { paymentService } from "../services/payment.service";
import { processorHealthService } from "../services/processor-health";
import { PROCESSORS, HEALTH_CHECK_INTERVAL } from "../config/processors";

const queueName = 'payment_queue';
export const startPaymentWorker = () => {
    const worker = new Worker(
        queueName,
        async job => {
            const result = await paymentService.processPayment(job.data);
            
            if (result.success) {
                return result;
            } else {
                throw new Error(result.error);
            }
        },
        {
            connection: redisConnectionConfig,
            concurrency: 10,
            autorun: false
        }
    );

    worker.on('failed', (job, err) => {
        console.error(`[Worker] Job ${job?.id} failed:`, err.message);
    });

    worker.on('completed', (job, result) => {
        console.log(`[Worker] Job ${job.id} completed successfully`);
    });

    const healthCheckInterval = setInterval(async () => {
        try {
            const healthyProcessor = await processorHealthService.selectBestProcessor(PROCESSORS);
            
            if (!healthyProcessor) {
                if (!worker.isPaused()) {
                    await worker.pause();
                }
            } else {
                if (worker.isPaused()) {
                    worker.resume();
                }
            }
        } catch (error) {
            console.error('[Worker] Health check failed:', error);
        }
    }, HEALTH_CHECK_INTERVAL);

    process.on('SIGINT', async () => {
        console.log('[Worker] Gracefully shutting down...');
        clearInterval(healthCheckInterval);
        await worker.close();
        process.exit(0);
    });

    worker.run();
    console.log('[Worker] Started with health monitoring');
    
    return worker;
};