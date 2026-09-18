import {
  Camera,
  Footprints,
  Map,
  MonitorSmartphone,
  MoveHorizontal,
  Pause,
  Play,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';

import { LinkButton } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';
import { BareShell } from '@/components/ui/PageShell';
import { TrailStill } from '@/components/ui/TrailStill';
import { SHELL_GUTTER, SHELL_WIDTH } from '@/components/layout/container';
import { HERO_STILL } from '@/lib/media/stills';

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
    title: 'Biomes and stages',
    body: 'Clear them in order. Finish a biome and the next one opens.',
    mark: '10',
    markLabel: 'stages in each biome',
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
      <section className="relative isolate flex min-h-[min(100dvh,52rem)] flex-col justify-center overflow-hidden">
        <TrailStill
          src={HERO_STILL}
          alt="Silhouette walking a mountain trail at sunset"
          fill
          priority
          sizes="100vw"
          className="object-cover object-[center_58%]"
        />
        <div
          aria-hidden
          className="absolute inset-0 bg-linear-to-t from-bg via-bg/35 to-transparent"
        />
        <div
          aria-hidden
          className="absolute inset-y-0 left-0 w-[min(100%,42rem)] bg-linear-to-r from-bg/70 via-bg/35 to-transparent"
        />
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-28 bg-linear-to-b from-bg/80 to-transparent"
        />

        <div
          className={`relative mx-auto flex w-full flex-col items-start gap-5 py-16 sm:py-20 ${SHELL_GUTTER} ${SHELL_WIDTH.wide}`}
        >
          <span className="eyebrow">Webcam exercise game</span>

          <h1 className="m-0 max-w-xl text-4xl leading-[1.05] font-semibold tracking-tight sm:text-5xl lg:text-6xl">
            Run the trail with your whole body
          </h1>

          <p className="m-0 max-w-lg text-base leading-relaxed text-text/85 sm:text-lg">
            Jog in place to attack, step sideways to switch lanes. Every frame is processed in your
            browser — no video is ever uploaded.
          </p>

          <div className="flex flex-col gap-3 self-stretch sm:flex-row sm:self-auto">
            <LinkButton href="/play" variant="primary" size="lg" icon={<Play size={20} />}>
              Play now
            </LinkButton>
            <LinkButton href="/calibrate" size="lg" icon={<Camera size={20} />}>
              Set up your camera
            </LinkButton>
          </div>

          <p className="m-0 text-sm text-subtle">
            No installation, no account. Works in any modern desktop browser with a webcam.
          </p>
        </div>
      </section>

      <section
        className={`mx-auto w-full py-16 sm:py-20 ${SHELL_GUTTER} ${SHELL_WIDTH.wide}`}
        aria-labelledby="features-heading"
      >
        <h2
          id="features-heading"
          className="m-0 text-center text-2xl font-semibold tracking-tight sm:text-3xl"
        >
          What this is
        </h2>
        <ul className="m-0 mt-8 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-3 sm:items-stretch">
          {FEATURES.map((feature) => (
            <li key={feature.title} className="min-w-0">
              <article
                className={`flex h-full flex-col gap-3 rounded-lg border bg-surface p-5 ${
                  feature.mark ? 'border-primary/35' : 'border-line'
                }`}
              >
                {feature.mark ? (
                  <p className="m-0 flex items-baseline gap-2">
                    <span className="text-4xl font-semibold tracking-tight text-primary">
                      {feature.mark}
                    </span>
                    <span className="text-sm text-muted">{feature.markLabel}</span>
                  </p>
                ) : (
                  <feature.icon aria-hidden size={20} className="text-accent" />
                )}
                <h3 className="m-0 text-base font-semibold text-text">{feature.title}</h3>
                <p className="m-0 text-sm leading-relaxed text-muted">{feature.body}</p>
              </article>
            </li>
          ))}
        </ul>
      </section>

      <section
        id="how-to-play"
        className="band scroll-mt-20 bg-surface py-16 sm:py-20"
        aria-labelledby="how-heading"
      >
        <div className={`mx-auto flex w-full flex-col gap-12 ${SHELL_GUTTER} ${SHELL_WIDTH.wide}`}>
          <div>
            <h2
              id="how-heading"
              className="m-0 text-center text-2xl font-semibold tracking-tight sm:text-3xl"
            >
              How to Play
            </h2>
            <p className="m-0 mx-auto mt-2 max-w-lg text-center text-sm leading-relaxed text-muted">
              The whole game is these three. Nothing to memorise, nothing in your hands.
            </p>

            <ul className="m-0 mt-8 flex list-none flex-col gap-2 p-0">
              {CONTROLS.map((control) => (
                <li
                  key={control.action}
                  className="flex items-center gap-4 rounded-md border border-line bg-elevated px-4 py-3.5"
                >
                  <span
                    aria-hidden
                    className="grid size-10 flex-none place-items-center rounded-md bg-surface text-accent"
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

          <div className="flex flex-col gap-5 border-t border-line pt-10">
            <h3 id="safety-heading" className="m-0 text-xl font-semibold tracking-tight sm:text-2xl">
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
