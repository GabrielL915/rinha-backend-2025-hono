import { Hono } from 'hono'
import { getRedis, initializeRedis } from './redis'

const app = new Hono()
await initializeRedis()

function validatePaymentRequest(body: any): { valid: boolean, error?: string } {
  if (!body) return { valid: false, error: 'Request body is required' }
  if (!body.correlationId) return { valid: false, error: 'correlationId is required' }
  if (typeof body.amount !== 'number' || body.amount <= 0) {
    return { valid: false, error: 'amount must be a positive number' }
  }
  return { valid: true }
}

app.post('/payments', async (c) => {
  try {
    const redis = getRedis()
    const body = await c.req.json()

    const validation = validatePaymentRequest(body)

    if (!validation.valid) {
      return c.json({ error: validation.error }, 400)
    }

    const added = await redis.sadd('payments:ids', body.correlationId)
    if (added === 0) {
      return c.json({ error: 'correlationId must be unique' }, 409)
    }

    await redis.lpush('payment_queue', JSON.stringify({
      correlationId: body.correlationId,
      amount: body.amount
    }))

    return c.json({ status: 'enqueued' }, 202)
  } catch (error) {
    console.error('Payment processing error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

app.get('/payments-summary', async (c) => {
  const redis = getRedis()

  const [reqs, amts] = await Promise.all([
    redis.hgetall('summary:requests'),
    redis.hgetall('summary:amount'),
  ])

  const result = {
    default: {
      totalRequests: parseInt(reqs.default || '0', 10),
      totalAmount: parseFloat(amts.default || '0'),
    },
    fallback: {
      totalRequests: parseInt(reqs.fallback || '0', 10),
      totalAmount: parseFloat(amts.fallback || '0'),
    }
  }

  return c.json(result)
})

//limpar dados local
app.post('purge-payments', async (c) => {
  const redis = getRedis()
  const keysToDel = [
    'payment_queue',
    'payments:ids',
    'summary:requests',
    'summary:amount'
  ]

  try {
    await redis.del(...keysToDel)
    return c.json({ message: 'All payments data purged.' })
  } catch (err) {
    console.error('[admin] failed to purge Redis data:', err)
    return c.json({ error: 'Failed to purge payments data' }, 500)
  }
})

export default app
