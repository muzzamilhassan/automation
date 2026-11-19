'use client';
// Route-segment error boundary (admin-panel review 2026-11-15 #8): a crash in
// one page shows this instead of a blank screen, with a retry. The error is
// logged to the browser console for debugging; details never leak to the UI.
import { useEffect } from 'react';
import Link from 'next/link';

export default function Error({ error, reset }) {
  useEffect(() => {
    console.error('[studio] page error:', error);
  }, [error]);

  return (
    <div role="alert" className="max-w-lg mx-auto mt-16 text-center px-4">
      <h1 className="text-[18px] font-semibold text-ink mb-2">Something went wrong on this page</h1>
      <p className="t-13 text-muted mb-5">
        The rest of the Studio still works. Try again — if it keeps failing, check Warnings or the latest run logs.
      </p>
      <div className="flex items-center justify-center gap-3">
        <button type="button" className="btn btn-primary" onClick={() => reset()}>Try again</button>
        <Link className="btn" href="/">Back to overview</Link>
      </div>
      {error?.digest ? <p className="t-11 text-faint mt-4">Reference: {error.digest}</p> : null}
    </div>
  );
}
