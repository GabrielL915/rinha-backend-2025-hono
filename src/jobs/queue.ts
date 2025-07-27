import { Queue } from "bullmq";
import { redisConnectionConfig } from "../config/redis";

export const paymentQueue = new Queue('payment_queue', {
    connection: redisConnectionConfig
})

export const healthCheckQueue = new Queue('health_queue', {
    connection: redisConnectionConfig,
})