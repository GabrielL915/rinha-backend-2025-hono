import { Hono } from 'hono'
import { paymentsRoute } from './routes'
import { initializeRedis } from './config/redis'

const app = new Hono()
await initializeRedis()

app.route('/', paymentsRoute)

export default {
    port: 9999,
    fetch: app.fetch
}
