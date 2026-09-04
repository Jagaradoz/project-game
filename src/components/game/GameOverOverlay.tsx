import type { HudSnapshot } from '@/engine/runtime';

interface GameOverOverlayProps {
  snapshot: HudSnapshot;
  onRestart: () => void;
}

export function GameOverOverlay({ snapshot, onRestart }: GameOverOverlayProps) {
  if (!snapshot.isOver) return null;

  return (
    <div className="absolute inset-0 z-[3] grid content-center justify-items-center gap-2.5 bg-[rgba(16,20,24,0.86)] p-6 text-center">
      <h2 className="m-0 text-[26px] font-bold">Run over</h2>
      <p className="m-0 tabular-nums text-muted">
        Score {snapshot.score} &middot; {Math.round(snapshot.distance)} m
      </p>
      <button
        type="button"
        onClick={onRestart}
        className="min-h-12 min-w-[180px] cursor-pointer rounded-lg border-0 bg-accent px-4 py-3 font-semibold text-[#04121a]"
      >
        Restart
      </button>
    </div>
  );
}
