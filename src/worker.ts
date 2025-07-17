import { initializeRedis } from './config/redis'
import { PROCESSORS } from './config/processors'
import { startPaymentWorker } from './processors/payment.processor'
import { processorHealthService } from './services/processor-health';

async function waitUntilAtLeastOneProcessorAvailable(): Promise<void> {
  console.log('[Worker] Aguarde inicialização de processadores...')
  const maxRetries = 10
  const delayMs = 1000

  for (let i = 0; i < maxRetries; i++) {
    let available = false

    for (const processor of PROCESSORS) {
      const isHealthy = await processorHealthService.isProcessorHealthy(processor)
      if (isHealthy) {
        console.log(`[Worker] Processador disponível: ${processor.url}`)
        available = true
        break
      }
    }

    if (available) {
      console.log('[Worker] Pelo menos um processador disponível.')
      return
    }

    console.log(`[Worker] Nenhum processador disponível. Tentativa ${i + 1}/${maxRetries}`)
    await new Promise(res => setTimeout(res, delayMs))
  }

  throw new Error('Nenhum processador ficou disponível após várias tentativas.')
}


await initializeRedis()
await waitUntilAtLeastOneProcessorAvailable()
startPaymentWorker()
