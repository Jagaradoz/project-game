/**
 * How wide the page column runs, in one place.
 *
 * The header, the footer, both shells and the game screen each used to hardcode
 * their own `max-w-*`, which is how they drifted to 1152 / 1152 / 1152 / 1024.
 * They have to agree: the header's underline and the content below it are the
 * same column, and a reader sees it immediately when they are not.
 *
 * The column is deliberately narrow. This is a portrait game -- the 3D camera is
 * framed for a tall viewport (see CONFIG.game.camera) -- and a 1152px marketing
 * column around a portrait canvas is what made the site read as horizontal.
 *
 * Landing heroes break out with BareShell `bleed`; inner copy still uses `wide`.
 */
export const SHELL_WIDTH = {
  /** A single column of fields. */
  narrow: 'max-w-md',
  /** Long-form reading, held near 70 characters. */
  prose: 'max-w-[40rem]',
  /** The default. Wide enough for a 5-across stage grid, narrow enough to scan. */
  wide: 'max-w-[52rem]',
} as const;

export type ShellWidth = keyof typeof SHELL_WIDTH;

export const SHELL_GUTTER = 'px-4 sm:px-6 lg:px-8';
