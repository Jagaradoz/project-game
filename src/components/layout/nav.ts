import { ShieldCheck, type LucideIcon } from 'lucide-react';

export type NavVariant = 'game' | 'study';

export interface NavLink {
  href: string;
  label: string;
  icon: LucideIcon;
}

/**
 * Game chrome has no destination list. Home is the wordmark, Play and Profile
 * are session-aware controls in the header, and everything else is reached
 * from a flow rather than from a nav item:
 *
 *   Stages      -- picked from /play and /calibrate, not the header.
 *   Calibrate   -- a step inside a flow. Linked from the landing page.
 *   How to play -- a section on the landing page (`/#how-to-play`).
 *   Leaderboard -- a view of /profile, reached by AccountTabs there. That tab
 *                  strip is load-bearing: drop it and the route is orphaned.
 */

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
