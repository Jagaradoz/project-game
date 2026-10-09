import Link from 'next/link';
import { Map } from 'lucide-react';

import { Badge } from '@/components/ui/Badge';
import { LinkButton } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { TrailStill } from '@/components/ui/TrailStill';
import { biomeName } from '@/lib/api/catalog';
import { formatDuration, formatNumber } from '@/lib/format';
import { biomeStillSrc } from '@/lib/media/stills';
import type { RunResult } from '@/types/api';

export function RunGrid({ runs }: { runs: RunResult[] }) {
  if (runs.length === 0) {
    return (
      <EmptyState
        title="No runs yet"
        icon={<Map size={22} />}
        action={
          <LinkButton href="/characters" variant="primary" icon={<Map size={18} />}>
            Start training
          </LinkButton>
        }
      >
        Play a run and it will show up here.
      </EmptyState>
    );
  }

  const bestScore = Math.max(...runs.map((run) => run.score));

  return (
    <ul className="m-0 grid list-none grid-cols-3 gap-1 p-0">
      {runs.map((run) => {
        const isBest = run.score === bestScore && bestScore > 0;
        const name = biomeName(run.biomeId);
        const outcome = run.isCleared ? 'cleared' : 'not cleared';
        const label = [
          name,
          'training',
          `${formatNumber(run.score)} points`,
          formatDuration(run.durationMs),
          outcome,
          isBest ? 'best score' : '',
        ]
          .filter(Boolean)
          .join(', ');

        return (
          <li key={run.id}>
            <Link
              href="/characters"
              aria-label={label}
              className="relative block aspect-3/4 overflow-hidden rounded-none border-2 border-ink text-white no-underline shadow-[4px_4px_0_0_var(--color-ink)]"
            >
              <TrailStill
                src={biomeStillSrc(run.biomeId)}
                alt=""
                fill
                sizes="(max-width: 832px) 33vw, 17rem"
                className="object-cover object-[center_32%]"
              />
              <div
                aria-hidden
                className="absolute inset-0 bg-linear-to-t from-black/80 via-black/25 to-black/10"
              />
              {(isBest || run.isCleared) && (
                <span className="absolute top-1.5 left-1.5">
                  <Badge tone={isBest ? 'primary' : 'ok'}>{isBest ? 'Best' : 'Cleared'}</Badge>
                </span>
              )}
              <span className="absolute inset-x-0 bottom-0 flex flex-col gap-0.5 p-1.5 sm:p-2">
                <span className="text-xs font-semibold leading-tight sm:text-sm">{name}</span>
                <span className="text-[10px] tabular-nums text-white/85 sm:text-xs">
                  Training · {formatNumber(run.score)} pts
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
