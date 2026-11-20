'use client';
// Live fix wave C1 (T1-15, T1-23) — tells the shell "this page doesn't exist".
// app/not-found.js renders <PageMissingMark />; the shell reads
// usePageMissing() and shows "Page not found" in the breadcrumb + tab title
// instead of a title guessed from the made-up URL.
//
// Both hooks answer false on the server AND during hydration (the server
// snapshot), so the first client render always matches the server HTML — the
// static 404 is prerendered under "/_not-found", and rendering anything from
// the real URL there was React error #418. useHydrated() turns true right
// after hydration (and on every later mount).
import { useLayoutEffect, useSyncExternalStore } from 'react';

let marks = 0;
const listeners = new Set();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const noop = () => () => {};

export function usePageMissing() {
  return useSyncExternalStore(subscribe, () => marks > 0, () => false);
}

export function useHydrated() {
  return useSyncExternalStore(noop, () => true, () => false);
}

export function PageMissingMark() {
  useLayoutEffect(() => {
    marks += 1;
    emit();
    return () => {
      marks -= 1;
      emit();
    };
  }, []);
  return null;
}
