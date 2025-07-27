export interface PaymentData {
    correlationId: string;
    amount: number;
    requestedAt: string;
}

export interface HealthResponse {
    failing: boolean;
    minResponseTime: number;
}

export type ProcessorName = 'default' | 'fallback' | '';

export interface ChooseResult {
    success: boolean;
    processor: ProcessorName;
}

export interface ProcessorConfig {
    url: string;
    name: string;
    priority: number;
    retryCount: number;
}

export interface HealthStatus {
    status: boolean;
    lastCheck: number;
    responseTime: number;
    consecutiveFailures: number;
}
