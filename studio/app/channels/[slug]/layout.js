// Live fix wave C1 (T1-24): /channels/<made-up slug> answered HTTP 200 with a
// "not found" card. This server wrapper answers a real 404 (the shared
// app/not-found.js) when the slug is no channel at all — not in brands.json
// (dormant brands included) and not in the registry (parked/paused included),
// the same universe the overview reads. The page itself is untouched.
// Fails open: if the channel list can't be read, the page renders and shows
// its own honest error state. Spec + QA: docs/qa/live-fix-wave-c1-qa.md.
import { notFound } from 'next/navigation';
import { isKnownChannelSlug } from '@/lib/channel-display.mjs';
// Bundled at build time — a runtime fs read of brands.json is not traced into
// this route's function on Vercel (ENOENT → the fail-open path → HTTP 200).
import legacyBrands from '@/lib/brands.json';

export const dynamic = 'force-dynamic';

function decoded(slug) {
  try {
    return decodeURIComponent(slug);
  } catch {
    return slug;
  }
}

export default async function ChannelSlugLayout({ children, params }) {
  const { slug } = await params;
  let known;
  try {
    const { readRegistry } = await import('@/lib/channels-registry');
    const legacy = legacyBrands || {};
    const reg = await readRegistry();
    const registry = Array.isArray(reg?.channels) ? reg.channels : [];
    // an empty registry is a degraded read, never "no channels" — don't 404 on it
    if (!registry.length) return children;
    known = isKnownChannelSlug(slug, legacy, registry) || isKnownChannelSlug(decoded(slug), legacy, registry);
  } catch {
    return children;
  }
  if (!known) notFound();
  return children;
}
