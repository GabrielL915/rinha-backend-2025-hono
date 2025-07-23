import { PROCESSORS } from './config/processors'
import { processorHealthService } from './services/processor-health';

export async function waitUntilAtLeastOneProcessorAvailable(): Promise<void> {
  const maxRetries = 10
  const delayMs = 1000

  for (let i = 0; i < maxRetries; i++) {
    let available = false

    for (const processor of PROCESSORS) {
      const isHealthy = await processorHealthService.isProcessorHealthy(processor)
      if (isHealthy) {
        available = true
        break
      }
    }

    if (available) {
      return
    }

    await new Promise(res => setTimeout(res, delayMs))
  }

  throw new Error('No processor is available after many requests.')
}


