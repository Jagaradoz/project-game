import pkg from '../../../package.json';

/**
 * The dev version, read from package.json so there is exactly one place to bump.
 * The prototype kept it in a hand-edited <span> in index.html, which meant two
 * places that could disagree.
 *
 * It exists because the app is tested over local servers and tunnels, where a
 * cached bundle is indistinguishable from a broken change without it.
 */
export function VersionTag() {
  return (
    <footer className="px-0 pt-3 pb-1 text-center text-xs tracking-[0.05em] text-muted opacity-80">
      Dev Version: v{pkg.version} (Testing Only)
    </footer>
  );
}
