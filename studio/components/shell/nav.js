import {
  LayoutDashboard,
  Inbox,
  Tv,
  Activity,
  Library,
  TrendingUp,
  Sparkles,
  Settings,
  ClipboardCheck,
  ListChecks,
  FileStack,
  TriangleAlert,
  Image as ImageIcon,
  Clapperboard,
  Layers,
  Palette,
  Share2,
  Music,
  Zap,
  ScrollText,
  UserPlus,
  PlugZap,
  Gauge,
  Users as UsersIcon,
  MonitorSmartphone,
} from 'lucide-react';

// Phase 2 (decision #3): the menu is named after the owner's jobs, not our
// internal hubs. No menu item carries a count badge: owner rule (feedback
// round 1) — real problems show ONLY in the topbar bell and on the Inbox page.
// `keywords` keep the retired names searchable in the command palette.
export const NAV = [
  {
    group: 'Cockpit',
    items: [
      { href: '/', label: 'Today', icon: LayoutDashboard, desc: 'Did today run? What needs you, channel by channel', keywords: ['overview', 'home', 'dashboard', 'pulse'] },
      { href: '/tasks', label: 'Inbox', icon: Inbox, desc: 'Scripts to approve and open alerts, in one queue', keywords: ['tasks', 'approvals', 'review', 'warnings', 'alerts'] },
      { href: '/channels', label: 'Channels', icon: Tv, desc: 'Every channel, its health and its settings', keywords: ['network', 'portfolio', 'brands'] },
      { href: '/runs', label: 'Runs', icon: Activity, desc: "Today's pipeline runs: started, finished, failed", keywords: ['operations', 'pipelines', 'production', 'logs'] },
      { href: '/videos', label: 'Library', icon: Library, desc: 'Every video made and published', keywords: ['content', 'videos', 'published'] },
      { href: '/analytics', label: 'Analytics', icon: TrendingUp, desc: 'Views, watch time, retention and leaderboards', keywords: ['stats', 'retention', 'growth'] },
    ],
  },
  {
    group: 'Make',
    items: [
      { href: '/studio', label: 'Create', icon: Sparkles, desc: 'Make a video, a thumbnail, or pick a template', keywords: ['studio', 'create', 'thumbnails', 'templates'] },
    ],
  },
  {
    group: 'System',
    items: [
      { href: '/settings', label: 'Settings', icon: Settings, desc: 'Appearance, team, security and AI services', keywords: ['preferences', 'account'] },
    ],
  },
];

// Every screen that still exists stays findable from ⌘K, filed under the
// menu section it now belongs to. Retired hubs (/content, /operations,
// /network) are redirects in next.config.mjs, so they are not listed.
// `crumb` is the short breadcrumb label when the screen sits under a parent
// URL (/templates/drafts → "Templates › Drafts"; see lib/breadcrumbs.mjs).
const SCREENS = [
  { href: '/review', label: 'Script approvals', icon: ClipboardCheck, group: 'Inbox', desc: 'Approve or reject scripts before they render', keywords: ['review queue'] },
  { href: '/topics', label: 'Topics', icon: ListChecks, group: 'Inbox', desc: 'Approve the topic backlog', keywords: ['topic desk'] },
  { href: '/templates/drafts', label: 'Template drafts', crumb: 'Drafts', icon: FileStack, group: 'Inbox', desc: 'New template drafts waiting for a yes or no', keywords: ['drafts inbox'] },
  { href: '/warnings', label: 'Alerts', icon: TriangleAlert, group: 'Inbox', desc: 'Open warnings: what broke and what to do', keywords: ['warnings', 'triage'] },
  { href: '/channels/add', label: 'Add channel', icon: UserPlus, group: 'Channels', desc: 'Connect a new YouTube channel', keywords: ['wizard', 'new channel'] },
  { href: '/production', label: 'Run a pipeline', icon: Zap, group: 'Runs', desc: 'Start a channel run by hand', keywords: ['pipelines', 'production'] },
  { href: '/logs', label: 'Upload log', icon: ScrollText, group: 'Runs', desc: 'Every post the machine made, newest first', keywords: ['execution logs', 'posting'] },
  { href: '/social', label: 'Cross-posts', icon: Share2, group: 'Library', desc: 'Facebook and Instagram cross-post results', keywords: ['social feeds'] },
  { href: '/music', label: 'Music', icon: Music, group: 'Library', desc: 'Background music for each channel', keywords: ['audio'] },
  { href: '/create', label: 'Create a video', icon: Sparkles, group: 'Create', desc: 'Make a vertical Short from a prompt', keywords: ['generate'] },
  { href: '/thumbs', label: 'Thumbnails', icon: ImageIcon, group: 'Create', desc: 'Design thumbnails and run A/B tests', keywords: ['thumbnail studio'] },
  { href: '/templates', label: 'Templates', icon: Clapperboard, group: 'Create', desc: 'Video templates and the live simulator', keywords: ['video templates'] },
  { href: '/templates/registry', label: 'Template registry', crumb: 'Registry', icon: Layers, group: 'Create', desc: 'Versioned templates and which channels use them', keywords: ['registry'] },
  { href: '/styles', label: 'Video styles', icon: Palette, group: 'Create', desc: 'The style catalog channels pick from', keywords: ['style catalog'] },
  { href: '/providers', label: 'AI services', icon: PlugZap, group: 'Settings', desc: 'Your own AI keys and which provider runs what', keywords: ['providers', 'byok', 'keys'] },
  { href: '/usage', label: 'Quota & costs', icon: Gauge, group: 'Settings', desc: 'YouTube quota and AI spend', keywords: ['usage', 'quota ledger'] },
  { href: '/users', label: 'Team', icon: UsersIcon, group: 'Settings', desc: 'Who can sign in and what they can do', keywords: ['users', 'user admin'] },
  { href: '/sessions', label: 'Sign-ins', icon: MonitorSmartphone, group: 'Settings', desc: 'Devices signed in to the panel', keywords: ['sessions'] },
];

export const ALL_NAV_ITEMS = [
  ...NAV.flatMap((g) => g.items.map((i) => ({ ...i, group: g.group }))),
  ...SCREENS,
];

// The sidebar menu items, flat (breadcrumbs file a screen under one of these).
export const MENU_ITEMS = NAV.flatMap((g) => g.items);

// Breadcrumb/title lookup: exact match first, then the longest href that
// prefixes the path (so /channels/add → "Add channel", /templates/x → "Templates").
export function navItemFor(pathname) {
  if (!pathname) return null;
  const exact = ALL_NAV_ITEMS.find((i) => i.href === pathname);
  if (exact) return exact;
  let best = null;
  for (const i of ALL_NAV_ITEMS) {
    if (i.href !== '/' && pathname.startsWith(i.href + '/') && (!best || i.href.length > best.href.length)) best = i;
  }
  return best;
}

// The sidebar item that owns a path (its active state). A screen's `group`
// is the label of the menu item it lives under, so this replaces the
// hand-kept prefix lists in AppShell's isPathActive.
export function navSectionFor(pathname) {
  const hit = navItemFor(pathname);
  if (!hit) return null;
  const top = NAV.flatMap((g) => g.items);
  return top.find((i) => i.href === hit.href) || top.find((i) => i.label === hit.group) || null;
}
