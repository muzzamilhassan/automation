'use client';
// Live fix wave B3 (T1-06): page changes showed no sign of life for 5–11 s.
// A thin bar at the very top starts the moment an in-app page change begins —
// any same-site link click (sidebar, breadcrumbs, pocket bar, page links) or a
// startNavProgress() call before router.push (the command palette) — creeps
// toward 90%, and finishes when the new route renders (pathname changes) or
// the URL commits (query-only changes). The rules live in lib/nav-progress.mjs.
// Reduced motion: the bar still shows, it just doesn't animate.
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { isTrackableNav, trickle } from '@/lib/nav-progress.mjs';

export const NAV_START_EVENT = 'qs:navstart';

// Call right before router.push(href) so programmatic navigations show the bar too.
export function startNavProgress(href) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(NAV_START_EVENT, { detail: { href } }));
}

// A navigation that never lands (cancelled, server error) must not leave the
// bar up forever.
const GIVE_UP_MS = 20000;

export default function NavProgress() {
  const pathname = usePathname();
  const [pct, setPct] = useState(0);
  const [visible, setVisible] = useState(false);
  const finishRef = useRef(() => {});

  useEffect(() => {
    const t = { creep: null, poll: null, cap: null, fade: null, reset: null };
    let active = false;
    const clearAll = () => {
      clearInterval(t.creep);
      clearInterval(t.poll);
      clearTimeout(t.cap);
      clearTimeout(t.fade);
      clearTimeout(t.reset);
    };
    const finish = () => {
      if (!active) return;
      active = false;
      clearAll();
      setPct(100);
      t.fade = setTimeout(() => setVisible(false), 200);
      t.reset = setTimeout(() => setPct(0), 450);
    };
    const begin = () => {
      clearAll();
      active = true;
      setVisible(true);
      setPct(8);
      const startHref = window.location.href;
      t.creep = setInterval(() => setPct((p) => trickle(p)), 250);
      // a query-only change keeps the pathname; the committed URL ends it instead
      t.poll = setInterval(() => {
        if (window.location.href !== startHref) finish();
      }, 120);
      t.cap = setTimeout(finish, GIVE_UP_MS);
    };
    const onClick = (e) => {
      const a = e.target instanceof Element ? e.target.closest('a[href]') : null;
      if (!a) return;
      const ok = isTrackableNav({
        href: a.getAttribute('href'),
        current: window.location.href,
        target: a.getAttribute('target'),
        button: e.button,
        modified: e.metaKey || e.ctrlKey || e.shiftKey || e.altKey,
        download: a.hasAttribute('download'),
      });
      if (ok) begin();
    };
    const onStart = (e) => {
      if (isTrackableNav({ href: e.detail?.href, current: window.location.href })) begin();
    };
    finishRef.current = finish;
    document.addEventListener('click', onClick, true);
    window.addEventListener(NAV_START_EVENT, onStart);
    return () => {
      document.removeEventListener('click', onClick, true);
      window.removeEventListener(NAV_START_EVENT, onStart);
      clearAll();
      finishRef.current = () => {};
    };
  }, []);

  // the new route rendered → finish
  useEffect(() => {
    finishRef.current();
  }, [pathname]);

  return (
    <div
      role="progressbar"
      aria-label="Loading page"
      aria-hidden={visible ? undefined : 'true'}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={visible ? Math.round(pct) : undefined}
      className="fixed top-0 left-0 right-0 z-[200] h-[2.5px] pointer-events-none"
    >
      <div
        className="h-full transition-[width,opacity] duration-200 ease-out motion-reduce:transition-none"
        style={{
          width: `${pct}%`,
          opacity: visible ? 1 : 0,
          background: 'var(--accent)',
          boxShadow: '0 0 8px var(--accent)',
        }}
      />
    </div>
  );
}
