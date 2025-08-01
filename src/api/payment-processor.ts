import { HealthResponse, PaymentData } from '../types';

export async function fetchPaymentProcessor(url: string, data: PaymentData) {
    const paymentsEndpoint = await fetch(`${url}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    })

    if (!paymentsEndpoint.ok) {
        return {
            success: false,
            error: 'Failed to process payment'
        }
    }

    return {
        success: paymentsEndpoint.ok
    }
}

export async function fetchPaymentProcessorHealth(url: string): Promise<HealthResponse> {
    const healthEndpoint = await fetch(`${url}/payments/service-health`, {
        headers: { 'Content-Type': 'application/json' }
    })

    if (!healthEndpoint.ok) {
        return {
            failing: true,
            minResponseTime: 0
        }
    }

    const healthData = await healthEndpoint.json() as { failing: boolean; responseTime: number }
    return {
        failing: healthData.failing,
        minResponseTime: healthData.responseTime
    }

}