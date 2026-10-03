'use client';

/* TOR 3: ระบบ Biome และ Stage -- ten stages per biome, unlocked in order. */

import { useRouter } from 'next/navigation';
import { Camera, Check, Lock, Play, Target } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { LinkButton } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';
import { PageShell } from '@/components/ui/PageShell';
import { TrailStill } from '@/components/ui/TrailStill';
import { DIFFICULTIES, difficultyLabel, stageGoalKills } from '@/engine/core/stage';
import type { Difficulty } from '@/engine/types';
import { getErrorMessage, repository } from '@/lib/api';
import { biomeIndex } from '@/lib/api/catalog';
import { formatNumber } from '@/lib/format';
import { biomeStillSrc } from '@/lib/media/stills';
import { useSettings } from '@/lib/store/settings';
import type { BiomeProgress, StageProgress } from '@/types/api';

export default function StagesPage() {
  const router = useRouter();

  const difficulty = useSettings((state) => state.difficulty);
  const setDifficulty = useSettings((state) => state.setDifficulty);
  const setStage = useSettings((state) => state.setStage);
  const stageBiomeId = useSettings((state) => state.stageBiomeId);
  const stageNumber = useSettings((state) => state.stageNumber);

  const [biomes, setBiomes] = useState<BiomeProgress[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    repository
      .getBiomes()
      .then((result) => {
        if (isActive) setBiomes(result);
      })
      .catch((cause: unknown) => {
        if (isActive) setError(getErrorMessage(cause));
      });

    return () => {
      isActive = false;
    };
  }, []);

  function play(biomeId: string, stage: number) {
    setStage(biomeId, stage);
    router.push('/play');
  }

  return (
    <PageShell
      eyebrow="The trail"
      title="Stages"
      subtitle="Ten stages, cleared in order. Clear a stage to unlock the next one."
      width="wide"
      actions={
        <LinkButton href="/calibrate" icon={<Camera size={18} />}>
          Calibrate first
        </LinkButton>
      }
    >
      {error && <Notice tone="error">{error}</Notice>}

      {/* TOR 3: ผู้เล่นสามารถเลือกระดับความยากเริ่มต้นได้. */}
      <Card title="Starting difficulty" icon={<Target size={20} />}>
        <div
          role="radiogroup"
          aria-label="Starting difficulty"
          className="grid grid-cols-3 gap-2 sm:max-w-md"
        >
          {DIFFICULTIES.map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={difficulty === option}
              onClick={() => setDifficulty(option)}
              className={`min-h-12 cursor-pointer border-2 border-ink px-4 py-3 font-black shadow-[3px_3px_0_0_var(--color-ink)] transition-[transform,box-shadow] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none ${
                difficulty === option
                  ? 'bg-primary text-on-primary'
                  : 'bg-elevated text-text'
              }`}
            >
              {difficultyLabel(option)}
            </button>
          ))}
        </div>
        <p className="m-0 max-w-2xl text-sm text-muted">
          Easier difficulties give you more health, slower enemies and a smaller target per stage.
          You can change this at any time; it applies to the next stage you start.
        </p>
      </Card>

      {!biomes ? (
        <p className="m-0 text-sm text-muted">Loading stages…</p>
      ) : (
        <div className="flex flex-col gap-4">
          {biomes.map((biome) => (
            <BiomeCard
              key={biome.biomeId}
              biome={biome}
              difficulty={difficulty}
              selectedBiomeId={stageBiomeId}
              selectedStage={stageNumber}
              onPlay={play}
            />
          ))}
        </div>
      )}
    </PageShell>
  );
}

interface BiomeCardProps {
  biome: BiomeProgress;
  difficulty: Difficulty;
  selectedBiomeId: string;
  selectedStage: number;
  onPlay: (biomeId: string, stageNumber: number) => void;
}

function BiomeCard({
  biome,
  difficulty,
  selectedBiomeId,
  selectedStage,
  onPlay,
}: BiomeCardProps) {
  const cleared = biome.stages.filter((stage) => stage.isCleared).length;
  const index = biomeIndex(biome.biomeId);

  return (
    <Card
      padded={false}
      className={biome.isUnlocked ? 'overflow-hidden' : 'overflow-hidden opacity-70'}
    >
      <div className="relative h-32 overflow-hidden sm:h-40">
        <TrailStill
          src={biomeStillSrc(biome.biomeId)}
          alt=""
          fill
          sizes="(max-width: 832px) 100vw, 52rem"
          className="object-cover object-[center_32%]"
        />
        <div
          aria-hidden
          className="absolute inset-0 bg-linear-to-t from-surface via-surface/50 to-black/10"
        />
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 px-4 pb-3 sm:px-5">
          <div className="flex flex-col gap-0.5">
            <h2 className="m-0 flex items-center gap-2 text-lg font-semibold tracking-tight text-text">
              {biome.isUnlocked ? (
                <Play aria-hidden size={16} className="text-accent" />
              ) : (
                <Lock aria-hidden size={16} className="text-muted" />
              )}
              {biome.name}
            </h2>
            <p className="m-0 text-xs text-muted">
              {biome.isUnlocked
                ? `${cleared} of ${biome.stages.length} stages cleared`
                : 'Unlocks when every stage of the previous biome is cleared'}
            </p>
          </div>
          {biome.isUnlocked ? (
            <Badge tone={cleared === biome.stages.length ? 'ok' : 'primary'}>
              {cleared === biome.stages.length ? 'Complete' : 'Unlocked'}
            </Badge>
          ) : (
            <Badge icon={<Lock size={12} />}>Locked</Badge>
          )}
        </div>
      </div>
      <div className="grid grid-cols-5 gap-2 p-4 sm:p-5">
        {biome.stages.map((stage) => (
          <StageButton
            key={stage.stageNumber}
            stage={stage}
            goalKills={stageGoalKills(index, stage.stageNumber, difficulty)}
            isSelected={selectedBiomeId === biome.biomeId && selectedStage === stage.stageNumber}
            onPlay={() => onPlay(biome.biomeId, stage.stageNumber)}
          />
        ))}
      </div>
    </Card>
  );
}

interface StageButtonProps {
  stage: StageProgress;
  goalKills: number;
  isSelected: boolean;
  onPlay: () => void;
}

function StageButton({ stage, goalKills, isSelected, onPlay }: StageButtonProps) {
  const status = stage.isCleared ? 'cleared' : stage.isUnlocked ? 'ready to play' : 'locked';

  return (
    <button
      type="button"
      disabled={!stage.isUnlocked}
      onClick={onPlay}
      // The label carries what the colour alone conveys, so the grid is usable
      // without seeing it.
      aria-label={`Stage ${stage.stageNumber} — ${status}, target ${goalKills} enemies${
        stage.bestScore === null ? '' : `, best score ${stage.bestScore}`
      }`}
      title={`Target: ${goalKills} enemies`}
      className={`flex aspect-square min-h-14 cursor-pointer flex-col items-center justify-center gap-0.5 border-2 border-ink font-black shadow-[3px_3px_0_0_var(--color-ink)] transition-[transform,box-shadow] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none disabled:cursor-not-allowed disabled:bg-bg disabled:text-subtle disabled:shadow-none ${
        stage.isCleared
          ? 'bg-ok-soft text-ok-text'
          : isSelected
            ? 'bg-primary text-on-primary'
            : 'bg-elevated text-text'
      }`}
    >
      <span className="text-xl leading-none font-semibold tabular-nums">{stage.stageNumber}</span>
      <span
        aria-hidden
        className="flex items-center gap-0.5 text-[10px] leading-none font-normal opacity-90"
      >
        {!stage.isUnlocked ? (
          <Lock size={11} />
        ) : stage.isCleared ? (
          <Check size={11} />
        ) : (
          <>
            <Target size={11} />
            {formatNumber(goalKills)}
          </>
        )}
      </span>
    </button>
  );
}
