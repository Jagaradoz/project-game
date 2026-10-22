import type { MovementId } from '@/lib/testing/evaluation';
import styles from './PoseDemo.module.css';

const DESCRIPTIONS: Record<MovementId, string> = {
  lateral: 'Move to one side, then return to the centre. Alternate left and right.',
  knees: 'Lift one knee, then lower it and lift the other knee. Keep alternating.',
  hips: 'Put both hands on your waist, then release them before the next hold.',
  clap: 'Separate your hands, clap above your head, then separate them again.',
};

/** A teaching diagram, independent of the live character's detected response. */
export function PoseDemo({ pose }: { pose: MovementId }) {
  const armsDown = 'M100 70 L76 91 L70 115 M100 70 L124 91 L130 115';
  const hips = 'M100 70 L66 87 L88 105 M100 70 L134 87 L112 105';
  const open = 'M100 70 L72 45 L65 20 M100 70 L128 45 L135 20';
  const closed = 'M100 70 L78 42 L98 18 M100 70 L122 42 L102 18';
  const straight = 'M100 116 L82 160 L78 184 M100 116 L118 160 L122 184';
  const leftKnee = 'M100 116 L69 117 L76 151 M100 116 L118 160 L122 184';
  const rightKnee = 'M100 116 L82 160 L78 184 M100 116 L131 117 L124 151';
  return <figure className="m-0 flex items-center gap-4 border-y border-ink/20 py-3">
    <svg viewBox="0 0 200 210" role="img" aria-label={DESCRIPTIONS[pose]} className="h-36 w-32 shrink-0 text-ink">
      <path d="M20 192 H180" stroke="currentColor" strokeWidth="2" opacity=".2" />
      {pose === 'lateral' && <><path d="M52 62 H22 L31 53 M22 62 L31 71 M148 62 H178 L169 53 M178 62 L169 71" fill="none" stroke="var(--color-primary)" strokeWidth="4" /><path d="M100 10 V190" stroke="currentColor" strokeDasharray="4 6" opacity=".2" /></>}
      <g className={`${styles.figure} ${pose === 'lateral' ? styles.lateral : ''}`} fill="none" stroke="currentColor" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="100" cy="46" r="14" fill="var(--color-primary)" />
        <path d="M100 63 V116" />
        <g className={styles.first}>
          <path d={pose === 'clap' ? open : armsDown} stroke={pose === 'clap' || pose === 'hips' ? 'var(--color-primary)' : 'currentColor'} />
          <path d={pose === 'knees' ? leftKnee : straight} stroke={pose === 'knees' ? 'var(--color-primary)' : 'currentColor'} />
        </g>
        <g className={styles.second}>
          <path d={pose === 'clap' ? closed : pose === 'hips' ? hips : armsDown} stroke={pose === 'clap' || pose === 'hips' ? 'var(--color-primary)' : 'currentColor'} />
          <path d={pose === 'knees' ? rightKnee : straight} stroke={pose === 'knees' ? 'var(--color-primary)' : 'currentColor'} />
        </g>
      </g>
    </svg>
    <figcaption className="text-sm leading-relaxed text-muted">{DESCRIPTIONS[pose]}</figcaption>
  </figure>;
}
