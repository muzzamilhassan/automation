// 404 page (admin-panel review 2026-11-15 #8) — replaces the bare framework page.
import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="max-w-lg mx-auto mt-16 text-center px-4">
      <h1 className="text-[18px] font-semibold text-ink mb-2">Page not found</h1>
      <p className="t-13 text-muted mb-5">This Studio page doesn&apos;t exist (or moved).</p>
      <Link className="btn btn-primary" href="/">Back to overview</Link>
    </div>
  );
}
