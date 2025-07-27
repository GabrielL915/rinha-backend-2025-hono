import { Hono } from 'hono'
import { paymentsRoute } from './routes'
import { initializeRedis } from './config/redis'
import { startPaymentWorker } from './jobs/worker'

const app = new Hono()
await initializeRedis()
startPaymentWorker()


app.route('/', paymentsRoute)

export default {
    port: 9999,
    fetch: app.fetch
}
