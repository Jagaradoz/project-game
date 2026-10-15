export interface NavLink { href: string; label: string; }

/** Every retained page shares the same visit-only navigation. */
export const NAV_LINKS: readonly NavLink[] = [
  { href: '/', label: 'Home' },
  { href: '/test', label: 'Test Mode' },
  { href: '/play', label: 'Game Mode' },
  { href: '/calibrate', label: 'Calibration' },
  { href: '/profile', label: 'Profile' },
];
