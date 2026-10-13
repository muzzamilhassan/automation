import {
  LayoutDashboard,
  Clapperboard,
  Film,
  TrendingUp,
  Tv,
  ScrollText,
  SquareKanban,
  Settings,
  ListChecks,
  UserCheck,
  KeyRound,
  Image as ImageIcon,
  Users as UsersIcon,
} from 'lucide-react';

export const NAV = [
  {
    group: 'Command',
    items: [
      { href: '/', label: 'Overview', icon: LayoutDashboard, desc: 'Empire status at a glance' },
      { href: '/production', label: 'Production', icon: Clapperboard, desc: 'Pipelines and one-click runs' },
      { href: '/videos', label: 'Videos', icon: Film, desc: 'Everything published' },
      { href: '/analytics', label: 'Analytics', icon: TrendingUp, desc: 'Retention, growth, SEO' },
      { href: '/topics', label: 'Topic Desk', icon: ListChecks, desc: 'Approve what gets made' },
      { href: '/client', label: 'Client View', icon: UserCheck, desc: 'DFY client workspace' },
    ],
  },
  {
    group: 'Network',
    items: [
      { href: '/channels', label: 'Channels', icon: Tv, desc: '16 brands, 4 live' },  {
    group: 'System',
    items: [
      { href: '/logs', label: 'Logs', icon: ScrollText, desc: 'Every post, newest first' },
      { href: '/tasks', label: 'Tasks', icon: SquareKanban, desc: 'Roadmap board' },
      { href: '/keys', label: 'API Keys', icon: KeyRound, desc: 'Per-channel provider keys' },
      { href: '/users', label: 'Users', icon: UsersIcon, desc: 'Super admin — all user data' },
      { href: '/thumbs', label: 'Thumbnails', icon: ImageIcon, desc: 'Design, preview, attach' },
      { href: '/settings', label: 'Settings', icon: Settings, desc: 'Theme, engine, integrations' },
    ],
  },
];

export const ALL_NAV_ITEMS = NAV.flatMap((g) => g.items.map((i) => ({ ...i, group: g.group })));
