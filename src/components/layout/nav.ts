import { Camera, FlaskConical, Home, Play, UserRound, type LucideIcon } from 'lucide-react';

export type NavVariant = 'game' | 'study';
export interface NavLink { href: string; label: string; icon: LucideIcon; }

/** All retained pages share the same visit-only navigation. */
export const GAME_NAV: readonly NavLink[] = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/test', label: 'Test Mode', icon: FlaskConical },
  { href: '/play', label: 'Game Mode', icon: Play },
  { href: '/calibrate', label: 'Calibration', icon: Camera },
  { href: '/profile', label: 'Profile', icon: UserRound },
];
export const STUDY_NAV = GAME_NAV;
