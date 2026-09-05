'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

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
      title="เลือก Stage และ Biome"
      tor="TOR 3: ระบบ Biome และ Stage — แต่ละพื้นที่มี 10 ด่าน ปลดล็อกตามลำดับ"
    >
      {error && <Notice tone="error">{error}</Notice>}

      <Card title="ระดับความยากเริ่มต้น" note="TOR 3: ผู้เล่นสามารถเลือกระดับความยากเริ่มต้นได้">
        <div
          role="radiogroup"
          aria-label="ระดับความยากเริ่มต้น"
          className="flex flex-wrap gap-2"
        >
          {DIFFICULTIES.map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={difficulty === option}
              onClick={() => setDifficulty(option)}
              className={`min-h-12 flex-[1_1_100px] cursor-pointer rounded-lg border px-4 py-3 font-semibold transition-colors ${
                difficulty === option
                  ? 'border-accent bg-accent text-[#04121a]'
                  : 'border-line text-text'
              }`}
            >
              {difficultyLabel(option)}
            </button>
          ))}
        </div>
        <p className="m-0 text-xs text-muted">
          ระดับที่ง่ายกว่าจะมีพลังชีวิตมากขึ้น ศัตรูมาช้าลง และเป้าหมายต่อด่านน้อยลง
          เปลี่ยนได้ทุกเมื่อ และมีผลกับด่านที่เริ่มเล่นครั้งถัดไป
        </p>
      </Card>

      {!biomes ? (
        <p className="m-0 text-sm text-muted">กำลังโหลด...</p>
      ) : (
        biomes.map((biome) => (
          <BiomeCard
            key={biome.biomeId}
            biome={biome}
            difficulty={difficulty}
            selectedBiomeId={stageBiomeId}
            selectedStage={stageNumber}
            onPlay={play}
          />
        ))
      )}

      <LinkButton href="/calibrate" className="self-start">
        ปรับเทียบกล้องก่อนเล่น
      </LinkButton>
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
      title={biome.isUnlocked ? biome.name : `🔒 ${biome.name}`}
      note={
        biome.isUnlocked
          ? `ผ่านแล้ว ${cleared} จาก ${biome.stages.length} ด่าน`
          : 'ปลดล็อกเมื่อผ่านครบทุกด่านของพื้นที่ก่อนหน้า'
      }
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
  const status = stage.isCleared ? 'ผ่านแล้ว' : stage.isUnlocked ? 'พร้อมเล่น' : 'ยังไม่ปลดล็อก';

  return (
    <button
      type="button"
      disabled={!stage.isUnlocked}
      onClick={onPlay}
      // The label carries what the colour alone conveys, so the grid is usable
      // without seeing it.
      aria-label={`ด่าน ${stage.stageNumber} — ${status}, เป้าหมาย ${goalKills} ตัว${
        stage.bestScore === null ? '' : `, คะแนนสูงสุด ${stage.bestScore}`
      }`}
      title={`เป้าหมาย ${goalKills} ตัว`}
      className={`flex aspect-square min-h-12 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-lg border font-bold transition-colors disabled:cursor-not-allowed disabled:border-line disabled:bg-panel disabled:text-off ${
        stage.isCleared
          ? 'border-ok bg-[#14291f] text-ok'
          : isSelected
            ? 'border-accent bg-accent text-[#04121a]'
            : 'border-line bg-surface text-text'
      }`}
    >
      <span className="text-lg leading-none tabular-nums">{stage.stageNumber}</span>
      <span className="text-[10px] leading-none font-normal opacity-80">
        {stage.isUnlocked ? `🎯 ${formatNumber(goalKills)}` : '🔒'}
      </span>
    </button>
  );
}
