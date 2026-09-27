import { useEffect, useRef, useState } from 'react';
import type { TodayTaskKind } from '@shared/today-tasks';

export function useTodayTarget(kind: TodayTaskKind) {
  const [target] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('todayTask') !== kind) return null;
    const rawId = params.get('todayId') || '';
    const rawDate = params.get('todayDate') || '';
    return {
      id: /^[1-9]\d*$/.test(rawId) ? Number(rawId) : null,
      date: /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : null,
    };
  });
  useEffect(() => {
    if (!target) return;
    const url = new URL(window.location.href);
    for (const key of ['todayTask', 'todayId', 'todayDate']) url.searchParams.delete(key);
    // The invoice queue already captured the order query. Don't retain that
    // one-order filter when returning through the regular navigation later.
    if (kind === 'invoices') url.searchParams.delete('order');
    window.history.replaceState(window.history.state, '', url);
  }, [kind, target]);
  return target;
}

export function useTodayScroll(elementId: string, ready: boolean) {
  const scrolled = useRef(false);
  useEffect(() => {
    if (!ready || scrolled.current) return;
    const element = document.getElementById(elementId);
    if (!element) return;
    scrolled.current = true;
    element.scrollIntoView({ block: 'center' });
    element.focus({ preventScroll: true });
  }, [elementId, ready]);
}
