import {
  Camera,
  Footprints,
  Map,
  MonitorSmartphone,
  MoveHorizontal,
  Pause,
  Play,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react';

import { Card } from '@/components/ui/Card';
import { LinkButton } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';
import { BareShell } from '@/components/ui/PageShell';
import { TrailStill } from '@/components/ui/TrailStill';
import { SHELL_GUTTER, SHELL_WIDTH } from '@/components/layout/container';
import { HERO_STILL } from '@/lib/media/stills';

/* TOR 3: หน้าแรกและคำแนะนำการใช้งาน -- the landing screen and its safety notes. */

const FEATURES = [
  {
    icon: MoveHorizontal,
    title: 'Your body is the controller',
    body: 'Step or lean left and right to change lanes. There is no gamepad, no keyboard and nothing to hold — just a webcam and room to move.',
  },
  {
    icon: Map,
    title: 'Biomes and stages',
    body: 'Ten stages per biome, cleared in order. Each one sets a target, and clearing the last stage of a biome opens the next.',
  },
  {
    icon: MonitorSmartphone,
    title: 'Runs in the browser',
    body: 'Nothing to install and no account required. Pose detection runs on your machine, so your camera feed never leaves it.',
  },
];

const STEPS = [
  {
    icon: Camera,
    title: 'Calibrate your camera',
    body: 'Allow camera access, stand where the system can see you from head to knee, and let it find your centre.',
  },
  {
    icon: Map,
    title: 'Pick a stage',
    body: 'Choose a biome, a stage and a starting difficulty that matches how hard you want to work.',
  },
  {
    icon: Play,
    title: 'Move to play',
    body: 'Jog in place to attack, step sideways to dodge. Stop moving and the attack stops with you.',
  },
];

const CONTROLS = [
  { icon: MoveHorizontal, action: 'Step or lean sideways', effect: 'Change lanes — left, centre, right' },
  { icon: Footprints, action: 'Jog in place', effect: 'Attack continuously while you keep moving' },
  { icon: Pause, action: 'Stand still', effect: 'Attacking stops, but the runner keeps going' },
];

const CAUTIONS = [
  'Clear about 1.5–2 metres of space around you before you start.',
  'Position the camera so it sees you from head to knee.',
  'Light your face from the front and avoid strong backlight from a window.',
  'Stop immediately if you feel dizzy, short of breath or unusually tired.',
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
        aria-labelledby="how-heading"
      >
        <h2 id="how-heading" className="m-0 text-2xl font-semibold tracking-tight sm:text-3xl">
          How it works
        </h2>
        <ol className="m-0 mt-8 grid list-none grid-cols-1 gap-6 p-0 sm:grid-cols-3">
          {STEPS.map((step, index) => (
            <li key={step.title} className="flex flex-col gap-3">
              <span className="text-sm font-semibold tabular-nums text-accent-text">
                0{index + 1}
              </span>
              <h3 className="m-0 flex items-center gap-2 text-base font-semibold">
                <step.icon aria-hidden size={17} className="flex-none text-accent" />
                {step.title}
              </h3>
              <p className="m-0 text-sm leading-relaxed text-muted">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="band bg-surface py-16 sm:py-20" aria-labelledby="features-heading">
        <div className={`mx-auto w-full ${SHELL_WIDTH.wide}`}>
          <h2 id="features-heading" className="m-0 text-2xl font-semibold tracking-tight sm:text-3xl">
            Built to keep you moving
          </h2>
          <ul className="m-0 mt-8 grid list-none grid-cols-1 gap-8 p-0 sm:grid-cols-3">
            {FEATURES.map((feature) => (
              <li key={feature.title} className="flex flex-col gap-2">
                <feature.icon aria-hidden size={20} className="text-accent" />
                <h3 className="m-0 text-base font-semibold text-text">{feature.title}</h3>
                <p className="m-0 text-sm leading-relaxed text-muted">{feature.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section
        className={`mx-auto w-full py-16 sm:py-20 ${SHELL_GUTTER} ${SHELL_WIDTH.wide}`}
        aria-labelledby="controls-heading"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-2">
            <h2 id="controls-heading" className="m-0 text-2xl font-semibold tracking-tight sm:text-3xl">
              Three movements
            </h2>
            <p className="m-0 max-w-lg text-sm leading-relaxed text-muted">
              The whole game runs on movements you already know. Nothing to memorise, and nothing
              that needs a free hand.
            </p>
          </div>
          <LinkButton
            href="/how-to-play"
            variant="ghost"
            className="self-start px-0 sm:self-auto"
          >
            Full guide
          </LinkButton>
        </div>

        <ul className="m-0 mt-8 flex list-none flex-col gap-2 p-0">
          {CONTROLS.map((control) => (
            <li
              key={control.action}
              className="flex items-center gap-4 rounded-md border border-line bg-surface px-4 py-3.5"
            >
              <span
                aria-hidden
                className="grid size-10 flex-none place-items-center rounded-md bg-elevated text-accent"
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
      </section>

      <section className="band bg-surface py-16 sm:py-20" aria-labelledby="safety-heading">
        <div className={`mx-auto flex w-full flex-col gap-6 ${SHELL_WIDTH.wide}`}>
          <h2 id="safety-heading" className="m-0 text-2xl font-semibold tracking-tight sm:text-3xl">
            Before you start
          </h2>

          <div className="grid gap-3 sm:grid-cols-2">
            <Notice tone="ok" title="Your camera feed stays on your device">
              All image processing and pose detection happens in your browser. Video frames are never
              sent to a server and are never stored.
            </Notice>
            <Notice tone="warn" title="This is not a medical device">
              Movement counts are what the system detects, not a clinically validated measure. Stop
              if you feel dizzy, short of breath or unusually tired.
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
      </section>

      <section
        className={`mx-auto w-full py-16 sm:py-20 ${SHELL_GUTTER} ${SHELL_WIDTH.wide}`}
        aria-labelledby="study-heading"
      >
        <Card title="Taking part in the study" note="Participant data handling" icon={<ShieldCheck size={20} />}>
          <h2 id="study-heading" className="sr-only">
            Study information
          </h2>
          <p className="m-0 text-sm leading-relaxed text-muted">
            This project studies how game elements affect motivation to move. If you are in the
            control group, read the information sheet and give consent before you begin.
          </p>
          <div className="flex flex-wrap gap-2">
            <LinkButton href="/consent" className="flex-[1_1_180px]">
              Information &amp; consent
            </LinkButton>
            <LinkButton href="/practice" className="flex-[1_1_180px]">
              Movement mode
            </LinkButton>
          </div>
        </Card>
      </section>

      <section className={`mx-auto w-full pb-20 ${SHELL_GUTTER} ${SHELL_WIDTH.wide}`}>
        <div className="flex flex-col items-start gap-5 rounded-lg border border-line bg-surface px-6 py-10 sm:px-8">
          <h2 className="m-0 max-w-lg text-2xl font-semibold tracking-tight sm:text-3xl">
            Set your camera up once, then just run
          </h2>
          <p className="m-0 max-w-xl text-sm leading-relaxed text-muted">
            Calibration takes under a minute and only has to happen once per session. After that,
            every stage is one click away.
          </p>
          <div className="flex flex-col gap-3 self-stretch sm:flex-row sm:self-auto">
            <LinkButton href="/calibrate" variant="primary" size="lg" icon={<Camera size={20} />}>
              Set up your camera
            </LinkButton>
            <LinkButton href="/stages" size="lg" icon={<Map size={20} />}>
              Browse stages
            </LinkButton>
          </div>
        </div>
      </section>
    </BareShell>
  );
}
