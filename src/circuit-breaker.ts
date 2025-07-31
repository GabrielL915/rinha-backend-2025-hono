import { getRedis } from "./config/redis";
import { ProcessorName, CircuitBreakerState } from "./types";

const FAILURE_THRESHOLD = 3;
const OPEN_TIMEOUT = 5000; // 5 segundos

export async function getCircuitBreakerState(processor: ProcessorName): Promise<CircuitBreakerState> {
  const redis = getRedis();
  const state = await redis.get(`cb:${processor}`);
  
  return state ? JSON.parse(state) : {
    state: "CLOSED",
    failures: 0,
    nextTry: 0
  };
}

export async function recordFailure(processor: ProcessorName) {
  const redis = getRedis();
  const key = `cb:${processor}`;
  
  const state: CircuitBreakerState = await getCircuitBreakerState(processor);
  state.failures++;
  
  if (state.failures >= FAILURE_THRESHOLD) {
    state.state = "OPEN";
    state.nextTry = Date.now() + OPEN_TIMEOUT;
  }
  
  await redis.set(key, JSON.stringify(state));
}

export async function recordSuccess(processor: ProcessorName) {
  const redis = getRedis();
  const key = `cb:${processor}`;
  
  await redis.set(key, JSON.stringify({
    state: "CLOSED",
    failures: 0,
    nextTry: 0
  }));
}

export async function canRequest(processor: ProcessorName): Promise<boolean> {
  const state = await getCircuitBreakerState(processor);
  
  if (state.state === "CLOSED") return true;
  if (state.state === "OPEN" && Date.now() > state.nextTry) {
    // Muda para HALF_OPEN para permitir uma tentativa
    state.state = "HALF_OPEN";
    await getRedis().set(`cb:${processor}`, JSON.stringify(state));
    return true;
  }
  
  return false;
}