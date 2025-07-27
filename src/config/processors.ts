import { ProcessorConfig } from "../types";

export const DEFAULT_PROCESSOR: ProcessorConfig = {
    url: process.env.PAYMENT_PROCESSOR_DEFAULT_URL as string,
    name: 'default',
    priority: 1,
    retryCount: 1
};

export const FALLBACK_PROCESSOR: ProcessorConfig = {
    url: process.env.PAYMENT_PROCESSOR_FALLBACK_URL as string,
    name: 'fallback',
    priority: 2,
    retryCount: 1
};

export const HEALTH_CHECK_INTERVAL = 5000;
export const ADMIN_PURGE_PATH = '/admin/purge-payments';
export const RINHA_TOKEN = '123';