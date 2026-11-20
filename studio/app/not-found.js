// 404 page (admin-panel review 2026-11-15 #8) — replaces the bare framework page.
// Live fix wave C1 (T1-15, T1-23): <PageMissingMark /> tells the shell this page
// doesn't exist, so the breadcrumb and tab title say "Page not found" (not a
// title guessed from the URL). Nothing here varies between server and browser.
import Link from 'next/link';
import { PageMissingMark } from '@/components/shell/page-missing';

export default function NotFound() {
  return (
    <div className="max-w-lg mx-auto mt-16 text-center px-4">
      <PageMissingMark />
      <h1 className="text-[18px] font-semibold text-ink mb-2">Page not found</h1>
      <p className="t-13 text-muted mb-5">This Studio page doesn&apos;t exist (or moved).</p>
      <Link className="btn btn-primary" href="/">Back to Today</Link>
    </div>
  );
}
