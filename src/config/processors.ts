import { ProcessorConfig } from "../types";

export const PROCESSORS: ProcessorConfig[] = [
    {
        url: 'http://localhost:8001',
        name: 'default',
        priority: 1,
        timeout: 10000,
        retryCount: 2
    },
    {
        url: 'http://localhost:8002',
        name: 'fallback',
        priority: 2,
        timeout: 15000,
        retryCount: 1
    }
];

export const HEALTH_CHECK_INTERVAL = 5000;
export const HEALTH_CACHE_TTL = 5000;
export const MAX_CONSECUTIVE_FAILURES = 3;