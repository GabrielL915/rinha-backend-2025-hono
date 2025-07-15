import { initializeRedis } from './config/redis'
import { startPaymentWorker } from './processors/payment.processor'

await initializeRedis()

startPaymentWorker()
