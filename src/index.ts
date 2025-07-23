import { Hono } from 'hono'
import { paymentsRoute } from './routes'
import { initializeRedis } from './config/redis'
import { waitUntilAtLeastOneProcessorAvailable } from './util'
import { startPaymentWorker } from './processors/payment.processor'

const app = new Hono()
await initializeRedis()
await waitUntilAtLeastOneProcessorAvailable()
startPaymentWorker()


app.route('/', paymentsRoute)

export default {
    port: 9999,
    fetch: app.fetch
}
