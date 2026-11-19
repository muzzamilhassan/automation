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
// Returns [{ label, href, current }]; the last crumb is the current page and
// has href null (shown as text, never a link).

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
    if (item) label = k > 0 && item.crumb ? item.crumb : item.label;
    else if (parent === CHANNELS) label = (channelNames && channelNames[seg]) || prettifySegment(seg);
    else label = prettifySegment(seg);
    out.push({ label, href });
  });

  // A screen that isn't itself a menu item starts with the menu item it lives
  // under (/users → Settings › Team).
  const root = byHref.get(`/${segs[0]}`);
  if (root && !menu.some((m) => m.href === root.href)) {
    const section = menu.find((m) => m.label === root.group);
    if (section) out.unshift({ label: section.label, href: section.href });
  }

  return out.map((c, i) => (i === out.length - 1 ? { label: c.label, href: null, current: true } : { label: c.label, href: c.href, current: false }));
}
