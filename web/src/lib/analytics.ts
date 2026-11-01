type AnalyticsEvent =
  | { type: 'pageview'; page: string; eventId: string }
  | { type: 'export'; wallId: string; eventId: string }
  | { type: 'active' };

export function trackedPage(pathname: string): 'login' | 'register' | 'walls' | 'editor' | null {
  if (pathname === '/login') return 'login';
  if (pathname === '/register') return 'register';
  if (pathname === '/walls') return 'walls';
  if (/^\/editor\/[^/]+$/.test(pathname)) return 'editor';
  return null;
}

/** Serialize to let the first anonymous cookie arrive before another page is counted. */
export function createAnalyticsTransport(fetcher: typeof fetch = (...args) => fetch(...args)) {
  let queue = Promise.resolve();
  return (event: AnalyticsEvent): Promise<void> => {
    queue = queue.then(async () => {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const result = await fetcher('/api/analytics/events', {
            method: 'POST', credentials: 'same-origin', keepalive: true,
            headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(event),
            signal: AbortSignal.timeout(5000),
          });
          if (result.ok || result.status < 500) return;
        } catch { /* Best effort; a retry uses the same event ID. */ }
      }
    }).catch(() => undefined);
    return queue;
  };
}

export const sendAnalytics = createAnalyticsTransport();
export function analyticsEventId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  // Event IDs are deduplication tokens, not credentials; support non-secure HTTP LAN access.
  return `evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`;
}
export function trackExport(wallId: string) {
  void sendAnalytics({ type: 'export', wallId, eventId: analyticsEventId() });
}
