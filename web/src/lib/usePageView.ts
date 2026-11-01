import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { analyticsEventId, sendAnalytics } from './analytics';

export function usePageView(page: string | null, ready: boolean) {
  const location = useLocation();
  const previous = useRef('');
  useEffect(() => {
    if (!ready || !page) return;
    // Redirect-only screens and StrictMode's initial effect are cancelled before sending.
    const timer = window.setTimeout(() => {
      const key = `${location.key}:${location.pathname}`;
      if (previous.current === key) return;
      previous.current = key;
      void sendAnalytics({ type: 'pageview', page, eventId: analyticsEventId() });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [ready, page, location.key, location.pathname]);
}
