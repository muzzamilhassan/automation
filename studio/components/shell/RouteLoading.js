// Live fix wave B3 (T1-06): the skeleton every heavy route's loading.js shows
// the instant a page change starts (Next prefetches it), instead of 5–11 s of
// the old page sitting still. Plain markup — no hooks, no data — so it works
// as a server component. Reduced motion: the shimmer stops (motion-reduce +
// the global prefers-reduced-motion rule in globals.css).
const bar = 'skeleton motion-reduce:animate-none';

export default function RouteLoading({ variant = 'list' }) {
  return (
    <div role="status" aria-live="polite" className="space-y-5">
      <span className="sr-only">Loading…</span>
      <div className="flex items-center gap-3.5" aria-hidden="true">
        <div className={`${bar} w-11 h-11 rounded-2xl shrink-0`} />
        <div className="space-y-2 min-w-0 flex-1">
          <div className={`${bar} h-6 w-48 max-w-full`} />
          <div className={`${bar} h-3.5 w-72 max-w-full`} />
        </div>
      </div>
      {variant === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4" aria-hidden="true">
          {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className={`${bar} h-40 rounded-2xl`} />)}
        </div>
      ) : variant === 'stats' ? (
        <div className="space-y-4" aria-hidden="true">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[0, 1, 2, 3].map((i) => <div key={i} className={`${bar} h-[104px] rounded-2xl`} />)}
          </div>
          <div className={`${bar} h-72 rounded-2xl`} />
        </div>
      ) : (
        <div className="space-y-2" aria-hidden="true">
          {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className={`${bar} h-12 rounded-xl`} />)}
        </div>
      )}
    </div>
  );
}
