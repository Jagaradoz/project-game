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
import { DIFFICULTIES, difficultyLabel, stageGoalKills } from '@/engine/core/stage';
import type { Difficulty } from '@/engine/types';
import { getErrorMessage, repository } from '@/lib/api';
import { biomeIndex } from '@/lib/api/catalog';
import { formatNumber } from '@/lib/format';
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
      title="Stages"
      subtitle="Ten stages per biome, cleared in order. Clear a biome to unlock the next one."
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
              className={`min-h-12 cursor-pointer rounded-lg border px-4 py-3 font-semibold transition-colors ${
                difficulty === option
                  ? 'border-primary bg-primary text-on-primary'
                  : 'border-line-strong bg-elevated text-text hover:border-muted'
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
      title={biome.name}
      icon={biome.isUnlocked ? <Play size={20} /> : <Lock size={20} />}
      note={
        biome.isUnlocked
          ? `${cleared} of ${biome.stages.length} stages cleared`
          : 'Unlocks when every stage of the previous biome is cleared'
      }
      actions={
        biome.isUnlocked ? (
          <Badge tone={cleared === biome.stages.length ? 'ok' : 'primary'}>
            {cleared === biome.stages.length ? 'Complete' : 'Unlocked'}
          </Badge>
        ) : (
          <Badge icon={<Lock size={12} />}>Locked</Badge>
        )
      }
      className={biome.isUnlocked ? '' : 'opacity-70'}
    >
      <div className="grid grid-cols-5 gap-2">
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
      className={`flex aspect-square min-h-14 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-lg border font-bold transition-colors disabled:cursor-not-allowed disabled:border-line disabled:bg-bg disabled:text-subtle ${
        stage.isCleared
          ? 'border-ok/50 bg-ok-soft text-ok-text hover:border-ok'
          : isSelected
            ? 'border-primary bg-primary text-on-primary'
            : 'border-line-strong bg-elevated text-text hover:border-muted'
      }`}
    >
      <span className="font-display text-xl leading-none tabular-nums">{stage.stageNumber}</span>
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
