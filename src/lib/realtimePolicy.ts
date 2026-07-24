export const REALTIME_FALLBACK_MS = 7_000;

export function realtimeFallbackInterval(healthy: boolean, online: boolean) {
  return !healthy && online ? REALTIME_FALLBACK_MS : false;
}
