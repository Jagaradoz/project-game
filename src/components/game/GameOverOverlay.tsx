import type { HudSnapshot } from '@/engine/runtime';

interface GameOverOverlayProps {
  snapshot: HudSnapshot;
  onRestart: () => void;
  /** Shown alongside Restart once the run has been recorded. */
  onSeeResult?: () => void;
  isSubmitting?: boolean;
}

/**
 * Ends the run. A cleared stage and a failed one look different on purpose --
 * TOR 5.1 asks for non-punitive design, so a loss is stated plainly and without
 * penalty language, and a clear is celebrated.
 */
export function GameOverOverlay({
  snapshot,
  onRestart,
  onSeeResult,
  isSubmitting,
}: GameOverOverlayProps) {
  if (!snapshot.isOver) return null;

  return (
    <div className="absolute inset-0 z-[3] grid content-center justify-items-center gap-2.5 bg-[rgba(16,20,24,0.86)] p-6 text-center">
      <h2 className="m-0 text-[26px] font-bold">
        {snapshot.isCleared ? 'ผ่านด่าน!' : 'จบรอบแล้ว'}
      </h2>

      <p className="m-0 tabular-nums text-muted">
        {snapshot.score} คะแนน &middot; {Math.round(snapshot.distance)} ม.
        {snapshot.goalKills !== null && (
          <> &middot; กำจัด {snapshot.killCount}/{snapshot.goalKills}</>
        )}
      </p>

      {!snapshot.isCleared && snapshot.goalKills !== null && (
        <p className="m-0 max-w-[280px] text-sm text-muted">
          ยังไม่ถึงเป้าหมายของด่านนี้ ลองใหม่ได้ทันที หรือปรับระดับความยากให้เหมาะกับคุณ
        </p>
      )}

      <div className="flex flex-wrap justify-center gap-2 pt-1">
        <button
          type="button"
          onClick={onRestart}
          className="min-h-12 min-w-[150px] cursor-pointer rounded-lg border-0 bg-accent px-4 py-3 font-semibold text-[#04121a]"
        >
          เล่นอีกครั้ง
        </button>

        {onSeeResult && (
          <button
            type="button"
            onClick={onSeeResult}
            disabled={isSubmitting}
            className="min-h-12 min-w-[150px] cursor-pointer rounded-lg border border-line bg-transparent px-4 py-3 font-semibold text-text disabled:cursor-not-allowed disabled:text-muted"
          >
            {isSubmitting ? 'กำลังบันทึก...' : 'ดูสรุปผล'}
          </button>
        )}
      </div>
    </div>
  );
}
