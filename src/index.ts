import { Hono } from 'hono'
import { paymentsRoute } from './routes'
import { initializeRedis, scheduleHealthChecks } from './config/redis'
import { startPaymentWorker, startHealthWorker } from './jobs/worker'
import { healthCheckQueue } from './jobs/queue'

const app = new Hono()
await initializeRedis()
startPaymentWorker()
startHealthWorker()
scheduleHealthChecks(healthCheckQueue)


app.route('/', paymentsRoute)

export default {
    port: 9999,
    fetch: app.fetch
}
