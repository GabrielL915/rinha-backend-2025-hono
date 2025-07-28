import { Queue } from "bullmq";
import { redisConnectionConfig } from "../config/redis";

export const paymentQueue = new Queue('payment_queue', {
    connection: {
        host: redisConnectionConfig.hostname,
        port: Number(redisConnectionConfig.port),
    }
})

export const healthCheckQueue = new Queue('health_queue', {
    connection: {
        host: redisConnectionConfig.hostname,
        port: Number(redisConnectionConfig.port),
    },
})