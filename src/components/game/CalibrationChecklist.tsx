import { Circle, CircleCheck } from 'lucide-react';

import type { HudSnapshot } from '@/engine/runtime';
import { classifyDistance, classifyLighting } from '@/engine/util/luma';

export interface CalibrationCheck {
  id: string;
  label: string;
  detail: string;
  isPassing: boolean;
}

/**
 * The gate on TOR 3 (ระบบปรับเทียบกล้อง): the run may not start until the system
 * has found the player in a workable position.
 *
 * A pure function of the snapshot plus the rehearsal progress, so the rule that
 * decides whether the run may start is one readable list rather than a
 * condition spread across the page.
 */
export function buildChecks(
  snapshot: HudSnapshot,
  rehearsal: { hasLeaned: boolean; hasJogged: boolean; hasRaisedArms: boolean; hasHeldHips: boolean },
): CalibrationCheck[] {
  const lighting = classifyLighting(snapshot.luma);
  const distance = classifyDistance(snapshot.shoulderWidth);

  return [
    // The body hop is optional -- raising both arms is the jump every player can do,
    // so neither feet in frame nor a real jump gate the run.
    {
      id: 'camera',
      label: 'Camera is on',
      detail: snapshot.isCameraRunning ? 'The camera is running' : 'The camera is not started yet',
      isPassing: snapshot.isCameraRunning,
    },
    {
      id: 'body',
      label: 'Your body is visible',
      detail: snapshot.hasBody ? 'Body detected' : 'No body found in the frame yet',
      isPassing: snapshot.hasBody,
    },
    {
      id: 'knees',
      label: 'Visible down to the knees',
      detail: snapshot.kneesVisible
        ? 'Both knees are visible'
        : 'Step back or tilt the camera until your knees are in frame — jog detection needs them',
      isPassing: snapshot.kneesVisible,
    },
    {
      id: 'distance',
      label: 'Distance is right',
      detail:
        distance === null
          ? 'Waiting for body detection'
          : distance === 'far'
            ? 'Too far away — move closer to the camera'
            : distance === 'close'
              ? 'Too close — step back from the camera'
              : 'Distance looks good',
      isPassing: distance === 'ok',
    },
    {
      id: 'lighting',
      label: 'Lighting is sufficient',
      detail:
        lighting === null
          ? 'Waiting for a light reading'
          : lighting === 'dark'
            ? 'Too dark — add light in front of you'
            : lighting === 'bright'
              ? 'Too bright — reduce the backlight behind you'
              : 'Lighting looks good',
      isPassing: lighting === 'ok',
    },
    {
      id: 'calibrated',
      label: 'Centre point set',
      detail: snapshot.isCalibrated
        ? 'Centre point captured'
        : 'Stand still in the middle of the frame for a moment to set your centre',
      isPassing: snapshot.isCalibrated,
    },
    {
      id: 'lean',
      label: 'Sideways step tested',
      detail: rehearsal.hasLeaned
        ? 'Sideways movement detected'
        : 'Try stepping or leaning to the left and to the right',
      isPassing: rehearsal.hasLeaned,
    },
    {
      id: 'jog',
      label: 'Jog in place tested',
      detail: rehearsal.hasJogged
        ? 'Jogging rhythm detected'
        : 'Try jogging in place, lifting your knees alternately',
      isPassing: rehearsal.hasJogged,
    },
    {
      id: 'armsUp',
      label: 'Raise both arms tested',
      detail: rehearsal.hasRaisedArms
        ? 'Both arms raised overhead — that is your jump'
        : 'Raise both arms above your head, then lower them',
      isPassing: rehearsal.hasRaisedArms,
    },
    {
      id: 'handsOnHips',
      label: 'Hands on hips tested',
      detail: rehearsal.hasHeldHips
        ? 'Hands on hips detected — that is your shield'
        : 'Put both hands on your hips, elbows out, and hold for a moment',
      isPassing: rehearsal.hasHeldHips,
    },
  ];
}

export function CalibrationChecklist({ checks }: { checks: CalibrationCheck[] }) {
  return (
    <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
      {checks.map((check) => (
        <li key={check.id} className="flex items-start gap-3 text-sm">
          {/* Decorative: the pass/fail state is spelled out in the label below. */}
          {check.isPassing ? (
            <CircleCheck aria-hidden size={18} className="mt-0.5 flex-none text-ok" />
          ) : (
            <Circle aria-hidden size={18} className="mt-0.5 flex-none text-subtle" />
          )}

          <span className="flex flex-col gap-0.5">
            <span className={`font-semibold ${check.isPassing ? 'text-ok-text' : 'text-text'}`}>
              {check.label}
              <span className="sr-only">{check.isPassing ? ' — passed' : ' — not passed yet'}</span>
            </span>
            <span className="text-xs leading-relaxed text-muted">{check.detail}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
