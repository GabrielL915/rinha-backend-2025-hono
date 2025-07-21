import { ProcessorConfig } from "../types";

export const PROCESSORS: ProcessorConfig[] = [
    {
        url: process.env.PAYMENT_PROCESSOR_DEFAULT_URL as string,
        name: 'default',
        priority: 1,
        timeout: 10000,
        retryCount: 2
    },
    {
        url: process.env.PAYMENT_PROCESSOR_FALLBACK_URL as string,
        name: 'fallback',
        priority: 2,
        timeout: 15000,
        retryCount: 1
    }
];

export const HEALTH_CHECK_INTERVAL = 5000;
export const HEALTH_CACHE_TTL = 5000;
export const MAX_CONSECUTIVE_FAILURES = 3;
export const ADMIN_PURGE_PATH = '/admin/purge-payments';
export const RINHA_TOKEN = '123';