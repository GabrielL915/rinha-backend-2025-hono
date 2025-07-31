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

export type ChooseResult = 
  | { success: true; processor: ProcessorName }  // Quando sucesso, processor obrigatório
  | { success: false; error?: string };          // Quando falha, processor ausente

export interface CircuitBreakerState {
  state: "CLOSED" | "OPEN" | "HALF_OPEN";
  failures: number;
  nextTry: number;
}

export interface ProcessorConfig {
  name: ProcessorName;
  url: string;
  circuitBreaker?: CircuitBreakerState;
}

export interface HealthStatus {
    status: boolean;
    lastCheck: number;
    responseTime: number;
    consecutiveFailures: number;
}
