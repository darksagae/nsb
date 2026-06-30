'use client';

import { useCallback, useEffect, useRef } from 'react';

const IDLE_MS = 5 * 60 * 1000;
const PRESENCE_MS = 60 * 1000;
const PRESENCE_ACTIVITY_MS = 90 * 1000;
const THROTTLE_MS = 1000;

/**
 * Keeps web presence in sync while the user is active, and signs out after
 * `IDLE_MS` with no meaningful input. `mousemove` is excluded so tiny pointer
 * drift does not prevent idle logout.
 */
export function useIdleLogout(onIdle: () => void, enabled = true) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastActivityRef = useRef(Date.now());
  const hiddenAtRef = useRef<number | null>(null);
  const onIdleRef = useRef(onIdle);
  onIdleRef.current = onIdle;

  const resetTimer = useCallback(() => {
    if (!enabled) return;
    lastActivityRef.current = Date.now();
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      onIdleRef.current();
    }, IDLE_MS);
  }, [enabled]);

  const sendPresence = useCallback(async () => {
    if (!enabled) return;
    if (Date.now() - lastActivityRef.current > PRESENCE_ACTIVITY_MS) return;
    try {
      await fetch('/api/sync/presence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'web', machineName: 'Web' }),
      });
    } catch {
      // ignore network errors; idle logout still applies
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;

    const events = ['mousedown', 'keydown', 'click', 'scroll', 'touchstart'] as const;
    let throttleTimer: ReturnType<typeof setTimeout> | null = null;

    const onActivity = () => {
      if (throttleTimer) return;
      throttleTimer = setTimeout(() => {
        throttleTimer = null;
        resetTimer();
      }, THROTTLE_MS);
    };

    resetTimer();
    void sendPresence();

    for (const ev of events) {
      window.addEventListener(ev, onActivity, { passive: true });
    }

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAtRef.current = Date.now();
        return;
      }
      const hiddenAt = hiddenAtRef.current;
      hiddenAtRef.current = null;
      if (hiddenAt && Date.now() - hiddenAt >= IDLE_MS) {
        onIdleRef.current();
        return;
      }
      resetTimer();
    };
    document.addEventListener('visibilitychange', onVisibility);

    const presenceTimer = setInterval(() => {
      void sendPresence();
    }, PRESENCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (throttleTimer) clearTimeout(throttleTimer);
      clearInterval(presenceTimer);
      for (const ev of events) {
        window.removeEventListener(ev, onActivity);
      }
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [enabled, resetTimer, sendPresence]);
}
