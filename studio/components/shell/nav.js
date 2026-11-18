import {
  LayoutDashboard,
  Sparkles,
  Film,
  Zap,
  Tv,
  Settings,
  Clapperboard,
  TrendingUp,
  ScrollText,
  SquareKanban,
  ListChecks,
  UserCheck,
  Image as ImageIcon,
  Users as UsersIcon,
  MonitorSmartphone,
  Layers,
  PlugZap,
  Gauge,
  ClipboardCheck,
  TriangleAlert,
  Share2,
  Music,
} from 'lucide-react';

export const NAV = [
  {
    group: 'Command',
    items: [
      { href: '/', label: 'Overview', icon: LayoutDashboard, desc: 'Pulse KPIs, active channels & daily production' },
      { href: '/studio', label: 'Studio', icon: Sparkles, desc: 'Review queue #106, topic desk, creation, thumbs & templates' },
      { href: '/content', label: 'Content', icon: Film, desc: 'Published videos, social cross-posts & audio engine' },
      { href: '/operations', label: 'Operations', icon: Zap, desc: 'Pipeline master switch, execution logs & warnings' },
      { href: '/network', label: 'Network', icon: Tv, desc: 'Channels portfolio, BYOK provider vault & quota ledger' },
    ],
  },
  {
    group: 'Preferences',
    items: [
      { href: '/settings', label: 'Settings', icon: Settings, desc: 'Appearance, team roles, security & roadmap' },
    ],
  },
];

export const ALL_NAV_ITEMS = [
  ...NAV.flatMap((g) => g.items.map((i) => ({ ...i, group: g.group }))),
  // Retain legacy paths for Command Palette searchability & bookmarks
  { href: '/review', label: 'Review Queue', icon: ClipboardCheck, group: 'Studio', desc: 'Script approvals #106' },
  { href: '/topics', label: 'Topic Desk', icon: ListChecks, group: 'Studio', desc: 'Approve topic backlog' },
  { href: '/create', label: 'Create Video', icon: Sparkles, group: 'Studio', desc: 'Generative vertical shorts' },
  { href: '/thumbs', label: 'Thumbnails', icon: ImageIcon, group: 'Studio', desc: 'Thumbnail studio & A/B' },
  { href: '/templates', label: 'Video Templates', icon: Clapperboard, group: 'Studio', desc: 'Templates catalog & simulator' },
  { href: '/videos', label: 'Videos', icon: Film, group: 'Content', desc: 'Everything published' },
  { href: '/social', label: 'Social Feeds', icon: Share2, group: 'Content', desc: 'Cross-post performance' },
  { href: '/music', label: 'Audio & Music', icon: Music, group: 'Content', desc: 'Channel BGM tracks' },
  { href: '/production', label: 'Production Pipelines', icon: Zap, group: 'Operations', desc: 'One-click runs' },
  { href: '/logs', label: 'Execution Logs', icon: ScrollText, group: 'Operations', desc: 'Posting stream' },
  { href: '/warnings', label: 'Warnings', icon: TriangleAlert, group: 'Operations', desc: 'Durable alert triage' },
  { href: '/channels', label: 'Channels', icon: Tv, group: 'Network', desc: 'Channel portfolio' },
  { href: '/providers', label: 'AI Providers', icon: PlugZap, group: 'Network', desc: 'BYOK vault v2' },
  { href: '/usage', label: 'Quota Ledger', icon: Gauge, group: 'Network', desc: 'Token & cost spend' },
  { href: '/analytics', label: 'Analytics', icon: TrendingUp, group: 'Command', desc: 'Retention & leaderboards' },
  { href: '/tasks', label: 'Roadmap Tasks', icon: SquareKanban, group: 'System', desc: 'Project roadmap' },
  { href: '/users', label: 'User Admin', icon: UsersIcon, group: 'System', desc: 'Account access' },
  { href: '/sessions', label: 'Sessions Admin', icon: MonitorSmartphone, group: 'System', desc: 'Device sign-ins' },
];
