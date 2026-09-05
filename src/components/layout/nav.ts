import { BookOpen, Map, ShieldCheck, User, type LucideIcon } from 'lucide-react';

export type NavVariant = 'game' | 'study';

export interface NavLink {
  href: string;
  label: string;
  icon: LucideIcon;
}

/**
 * The three destinations a player navigates to deliberately. Everything else
 * reached the header by being a route rather than by being a destination:
 *
 *   Home        -- the Wordmark is already the link home.
 *   Play        -- the header's CTA is the Play link; two of them is one too many.
 *   Calibrate   -- a step inside a flow, not a place. Linked from the landing
 *                  page, /how-to-play, /stages and the footer.
 *   Leaderboard -- a view of /profile, and reached by AccountTabs there. It has
 *                  no other inbound link, so that tab strip is load-bearing:
 *                  drop it and the route is orphaned.
 */
export const GAME_NAV: readonly NavLink[] = [
  { href: '/how-to-play', label: 'How to Play', icon: BookOpen },
  { href: '/stages', label: 'Stages', icon: Map },
  { href: '/profile', label: 'Profile', icon: User },
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
