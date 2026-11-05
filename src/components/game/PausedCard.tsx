import { Pause } from 'lucide-react';

/** Waiting on the player's body: before a run starts and after it is lost mid-run. */
export function PausedCard({ detail }: { detail: string }) {
  return <div className="flex w-full max-w-xs items-center gap-3 border-2 border-ink bg-surface p-4 shadow-[5px_5px_0_var(--color-primary)]">
    <span aria-hidden className="grid size-11 flex-none place-content-center border-2 border-ink bg-primary text-ink">
      <Pause size={20} className="fill-current" />
    </span>
    <div className="min-w-0">
      <h2 className="m-0 text-xl leading-tight font-black tracking-tight">Paused</h2>
      <p role="status" className="m-0 mt-0.5 text-sm leading-snug text-muted">{detail}</p>
    </div>
  </div>;
}
