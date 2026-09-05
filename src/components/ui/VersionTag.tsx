import pkg from '../../../package.json';

/**
 * The dev version, read from package.json so there is exactly one place to bump.
 *
 * It exists because the app is tested over local servers and tunnels, where a
 * cached bundle is indistinguishable from a broken change without it.
 */
export function VersionTag() {
  return (
    <p className="m-0 text-center text-xs tracking-[0.05em] text-subtle">
      Dev build v{pkg.version} &middot; testing only
    </p>
  );
}
