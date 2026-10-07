import {
  ArrowBigUp,
  Footprints,
  Map,
  MonitorSmartphone,
  MoveHorizontal,
  Pause,
  Play,
  Shield,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';

import { LinkButton } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';
import { BareShell } from '@/components/ui/PageShell';
import { SHELL_GUTTER, SHELL_WIDTH } from '@/components/layout/container';

/* TOR 3: หน้าแรกและคำแนะนำการใช้งาน -- the landing screen and its safety notes. */

const FEATURES: {
  icon: LucideIcon;
  title: string;
  body: string;
  mark?: string;
  markLabel?: string;
}[] = [
  {
    icon: MoveHorizontal,
    title: 'Your body is the controller',
    body: 'Step or lean left and right to change lanes. Nothing to hold — a webcam and room to move.',
  },
  {
    icon: Map,
    title: 'Training mode',
    body: 'One forest trail, five gentle moves. Paced for every age — no difficulty to pick.',
    mark: '5',
    markLabel: 'moves to learn',
  },
  {
    icon: MonitorSmartphone,
    title: 'Stays on this device',
    body: 'Nothing to install. Pose detection runs in the browser, so the camera feed never leaves it.',
  },
];

const CONTROLS = [
  { icon: MoveHorizontal, action: 'Step or lean sideways', effect: 'Switch lane — left, centre, or right' },
  { icon: Footprints, action: 'Jog in place', effect: 'Attack for as long as you keep moving' },
  { icon: ArrowBigUp, action: 'Raise both arms', effect: 'Jump over logs, stones and rivers' },
  { icon: Shield, action: 'Hands on hips', effect: 'Hold a shield through poison spore clouds' },
  { icon: Pause, action: 'Stand still', effect: 'Attacking stops. The runner still goes forward' },
];

const CAUTIONS = [
  'Clear 1.5–2 metres around you, and a floor that is not slippery.',
  'Stand so the camera sees you from head to knee.',
  'Light your face from the front. A bright window behind you hides your outline.',
];

export default function HomePage() {
  return (
    <BareShell bleed>
      <section className={`mx-auto w-full py-8 sm:py-12 ${SHELL_GUTTER} ${SHELL_WIDTH.wide}`}>
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-7 py-10 text-center sm:py-16">
          <span className="eyebrow">Your body is the controller</span>
          <h1 className="m-0 text-5xl leading-[1.02] font-black tracking-[-0.05em] sm:text-7xl xl:text-8xl">
            Get moving.
            <br />
            <span className="mt-2 inline-block bg-primary px-3 text-on-primary shadow-[6px_6px_0_0_var(--color-ink)]">
              Get playing.
            </span>
          </h1>
          <p className="m-0 max-w-xl text-base leading-relaxed text-muted sm:text-lg">
            Jog in place to attack. Step sideways to dodge. Your webcam reads your movement right
            here in your browser — no controller needed.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <LinkButton href="/play" variant="primary" size="lg" icon={<Play size={20} />}>
              Play now
            </LinkButton>
            <LinkButton href="#how-to-play" variant="secondary" size="lg">
              How to play
            </LinkButton>
          </div>
          <ul className="m-0 mt-2 flex list-none flex-wrap justify-center gap-2 p-0">
            {CONTROLS.map((control) => (
              <li
                key={control.action}
                className="flex items-center gap-2 border-2 border-ink px-3 py-1.5 text-xs font-bold tracking-wide text-text uppercase"
              >
                <control.icon aria-hidden size={14} className="text-primary" />
                {control.action}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section
        className={`mx-auto w-full py-16 sm:py-20 ${SHELL_GUTTER} ${SHELL_WIDTH.wide}`}
        aria-labelledby="features-heading"
      >
        <h2
          id="features-heading"
          className="m-0 text-center text-3xl font-black tracking-tight sm:text-4xl"
        >
          What this is
        </h2>
        <ul className="m-0 mt-8 grid list-none grid-cols-1 gap-5 p-0 sm:grid-cols-3 sm:items-stretch">
          {FEATURES.map((feature) => (
            <li key={feature.title} className="min-w-0">
              <article
                className={`flex h-full flex-col gap-3 border-2 border-ink bg-surface p-5 shadow-[5px_5px_0_0_var(--color-ink)] ${
                  feature.mark ? 'border-t-[10px] border-t-primary' : ''
                }`}
              >
                {feature.mark ? (
                  <p className="m-0 flex items-baseline gap-2">
                    <span className="text-4xl font-black tracking-tight text-primary">
                      {feature.mark}
                    </span>
                    <span className="text-sm text-muted">{feature.markLabel}</span>
                  </p>
                ) : (
                  <feature.icon aria-hidden size={28} className="text-primary" />
                )}
                <h3 className="m-0 text-lg font-black text-text">{feature.title}</h3>
                <p className="m-0 text-sm leading-relaxed text-muted">{feature.body}</p>
              </article>
            </li>
          ))}
        </ul>
      </section>

      <section
        id="how-to-play"
        className="band scroll-mt-20 border-y-2 border-ink bg-primary-soft py-16 sm:py-20"
        aria-labelledby="how-heading"
      >
        <div className={`mx-auto flex w-full flex-col gap-12 ${SHELL_GUTTER} ${SHELL_WIDTH.wide}`}>
          <div>
            <h2
              id="how-heading"
              className="m-0 text-center text-3xl font-black tracking-tight sm:text-4xl"
            >
              How to Play
            </h2>
            <p className="m-0 mx-auto mt-2 max-w-lg text-center text-sm leading-relaxed text-muted">
              The whole game is these five. Nothing to memorise, nothing in your hands.
            </p>

            <ul className="m-0 mt-8 flex list-none flex-col gap-2 p-0">
              {CONTROLS.map((control) => (
                <li
                  key={control.action}
                  className="flex items-center gap-4 border-2 border-ink bg-surface px-4 py-3.5 shadow-[4px_4px_0_0_var(--color-ink)]"
                >
                  <span
                    aria-hidden
                    className="grid size-10 flex-none place-items-center border-2 border-ink bg-primary text-on-primary"
                  >
                    <control.icon size={20} />
                  </span>
                  <div className="flex min-w-0 flex-col">
                    <span className="font-semibold text-text">{control.action}</span>
                    <span className="text-sm text-muted">{control.effect}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col gap-5 border-t-2 border-ink pt-10">
            <h3 id="safety-heading" className="m-0 text-xl font-black tracking-tight sm:text-2xl">
              Before you start
            </h3>

            <div className="grid gap-3 sm:grid-cols-2">
              <Notice tone="ok" title="Camera feed stays on this device">
                Pose detection runs in your browser. Frames are never uploaded or stored.
              </Notice>
              <Notice tone="warn" title="This is not a medical device">
                Stop if you feel dizzy, short of breath, or unusually tired.
              </Notice>
            </div>

            <ul className="m-0 flex list-none flex-col gap-2 p-0 text-sm text-muted">
              {CAUTIONS.map((item) => (
                <li key={item} className="flex gap-2.5">
                  <TriangleAlert aria-hidden size={16} className="mt-0.5 flex-none text-accent" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </BareShell>
  );
}
