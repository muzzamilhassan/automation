// Owner feedback round 1 (C): a breadcrumb on every page, at every width.
// Spec + QA: docs/qa/feedback-r1-shell-qa.md.
//
// Pure: pathname → crumb list. No imports at all (so `node --test` runs it
// without the '@/' alias); the shell passes in the menu from nav.js and the
// live channel names from /api/brands.
//
//   items        every screen the panel knows: { href, label, group, crumb? }
//                (`crumb` is the short label used when the screen sits under a
//                parent URL, e.g. /templates/drafts → "Drafts")
//   menu         the sidebar menu items — a screen that isn't one of them is
//                filed under the menu item whose label is its `group`
//   channelNames { slug: display name } for /channels/<slug>
//
// Returns [{ label, href, current, guessed? }]; the last crumb is the current
// page and has href null (shown as text, never a link). `guessed: true` marks a
// label prettified from the URL (no menu item, no live name) — live fix wave
// C1 (T1-15): the shell only renders those after hydration, because the
// static 404 HTML is prerendered under "/_not-found", not the URL you typed.
//
// Live fix wave C1 (docs/qa/live-fix-wave-c1-qa.md) also adds:
//   menuSectionFor  the menu item a path lives under — the SAME rule the
//                   trail starts with, so the sidebar highlight follows it (T1-12)
//   notFoundCrumbs  the trail on a 404: "Page not found" (T1-23)
//   phoneCrumbs     "… › parent › page" on phones (T1-27)
//   tabTitle        the browser tab title from the trail (T1-25)

const CHANNELS = '/channels';

export function prettifySegment(seg) {
  let s = String(seg ?? '');
  try {
    s = decodeURIComponent(s);
  } catch {
    // malformed escape — keep the raw text
  }
  return s
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function cleanPath(pathname) {
  if (typeof pathname !== 'string' || !pathname) return null;
  const p = pathname.split(/[?#]/)[0].replace(/\/{2,}/g, '/');
  if (!p.startsWith('/')) return null;
  return p.length > 1 ? p.replace(/\/+$/, '') : p;
}

// The sidebar menu item a path is filed under: the top-level screen itself
// when it is a menu item (/channels/x → Channels), else the menu item named by
// its `group` (/templates/drafts → Create). null when the path is unknown.
export function menuSectionFor(pathname, { items = [], menu = [] } = {}) {
  const path = cleanPath(pathname);
  if (!path) return null;
  if (path === '/') return menu.find((m) => m.href === '/') || null;
  const top = `/${path.split('/').filter(Boolean)[0]}`;
  const own = menu.find((m) => m.href === top);
  if (own) return own;
  const root = items.find((i) => i.href === top);
  return (root && menu.find((m) => m.label === root.group)) || null;
}

export function buildBreadcrumbs(pathname, { items = [], menu = [], channelNames = null } = {}) {
  const path = cleanPath(pathname);
  if (!path) return [];
  const byHref = new Map(items.map((i) => [i.href, i]));

  if (path === '/') {
    const home = byHref.get('/');
    return [{ label: home ? home.label : 'Home', href: null, current: true }];
  }

  const segs = path.split('/').filter(Boolean);
  const out = [];
  segs.forEach((seg, k) => {
    const href = `/${segs.slice(0, k + 1).join('/')}`;
    const parent = k > 0 ? `/${segs.slice(0, k).join('/')}` : null;
    const item = byHref.get(href);
    let label;
    let guessed = false;
    if (item) label = k > 0 && item.crumb ? item.crumb : item.label;
    // T1-24: until the live names arrive, a neutral word — never a guessed slug
    else if (parent === CHANNELS && k === 1) label = (channelNames && channelNames[seg]) || 'Channel';
    else {
      label = prettifySegment(seg);
      guessed = true;
    }
    out.push(guessed ? { label, href, guessed } : { label, href });
  });

  // A screen that isn't itself a menu item starts with the menu item it lives
  // under (/users → Settings › Team).
  const section = menuSectionFor(path, { items, menu });
  if (section && section.href !== `/${segs[0]}`) out.unshift({ label: section.label, href: section.href });

  return out.map((c, i) => {
    const crumb = i === out.length - 1 ? { label: c.label, href: null, current: true } : { label: c.label, href: c.href, current: false };
    return c.guessed ? { ...crumb, guessed: true } : crumb;
  });
}

// T1-23: a page that doesn't exist is "Page not found" — not its made-up URL.
export function notFoundCrumbs() {
  return [{ label: 'Page not found', href: null, current: true }];
}

// T1-27: on phones a long trail becomes "… › parent › page". Every crumb is
// kept (desktop shows the full trail); each item says where it shows:
//   only   'phone' (the "…" link) | 'desk' (collapsed on phones) | null (both)
//   sep    draw a › before it (never before the first item on either width)
// The "…" links to the nearest hidden parent; `title` names what it hides.
export function phoneCrumbs(crumbs, keep = 2) {
  const list = Array.isArray(crumbs) ? crumbs : [];
  if (list.length <= keep) return list.map((c, i) => ({ ...c, only: null, sep: i > 0 }));
  const hidden = list.slice(0, list.length - keep);
  const dots = {
    label: '…',
    href: hidden.at(-1).href,
    current: false,
    ellipsis: true,
    title: hidden.map((c) => c.label).join(' › '),
    only: 'phone',
    sep: false,
  };
  return [
    dots,
    ...hidden.map((c, i) => ({ ...c, only: 'desk', sep: i > 0 })),
    ...list.slice(hidden.length).map((c) => ({ ...c, only: null, sep: true })),
  ];
}

// T1-25: "Channels · Quarry Studio" — the current page's crumb, then the app.
const APP = 'Quarry Studio';
export function tabTitle(crumbs) {
  const last = Array.isArray(crumbs) && crumbs.length ? crumbs[crumbs.length - 1] : null;
  return last && last.label ? `${last.label} · ${APP}` : APP;
}
