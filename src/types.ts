export interface PaymentData {
    correlationId: string;
    amount: number;
    requestedAt: string;
    processor?: string;
}

export interface SummaryValue {
  totalRequests: number;
  totalAmount: number;
}

export interface HealthResponse {
    failing: boolean;
    minResponseTime: number;
}

export type ProcessorName = 'default' | 'fallback';

export interface ChooseResult {
    success: boolean;
    processor?: ProcessorName;
    error?: string;
}

export interface HealthStatus {
    status: boolean;
    lastCheck: number;
    responseTime: number;
    consecutiveFailures: number;
}
