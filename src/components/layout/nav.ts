import {
  ChartColumn,
  House,
  BookOpen,
  Camera,
  Gamepad2,
  Map,
  ShieldCheck,
  User,
  type LucideIcon,
} from 'lucide-react';

export type NavVariant = 'game' | 'study';

export interface NavLink {
  href: string;
  label: string;
  icon: LucideIcon;
}

/** Every player-facing route, in the order a player meets them. */
export const GAME_NAV: readonly NavLink[] = [
  { href: '/', label: 'Home', icon: House },
  { href: '/how-to-play', label: 'How to Play', icon: BookOpen },
  { href: '/calibrate', label: 'Calibrate', icon: Camera },
  { href: '/stages', label: 'Stages', icon: Map },
  { href: '/play', label: 'Play', icon: Gamepad2 },
  { href: '/profile', label: 'Profile', icon: User },
  { href: '/leaderboard', label: 'Leaderboard', icon: ChartColumn },
];

/**
 * The control group's nav.
 *
 * The study puts the control condition through the same movements with no game
 * elements, so the chrome has to honour that too: a link reading "Leaderboard"
 * or "Stages" is a game element on screen, and it would leak the very variable
 * the comparison is trying to isolate. (TOR 3, Proposal 9.3.)
 */
export const STUDY_NAV: readonly NavLink[] = [
  { href: '/consent', label: 'Information & Consent', icon: ShieldCheck },
];
