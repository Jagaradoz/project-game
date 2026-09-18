import { VersionTag } from '@/components/ui/VersionTag';
import { SHELL_GUTTER, SHELL_WIDTH } from '@/components/layout/container';

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-line bg-bg">
      <div
        className={`mx-auto flex ${SHELL_WIDTH.wide} flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3 ${SHELL_GUTTER}`}
      >
        <p className="m-0 text-xs text-subtle">
          Pose detection stays in this browser. Not a medical device.
        </p>
        <VersionTag />
      </div>
    </footer>
  );
}
