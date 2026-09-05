import {
  ArrowRight,
  Camera,
  Footprints,
  Gamepad2,
  Map,
  MonitorSmartphone,
  MoveHorizontal,
  Pause,
  Play,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  Trophy,
} from 'lucide-react';

import { Card } from '@/components/ui/Card';
import { LinkButton } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';
import { BareShell } from '@/components/ui/PageShell';

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
    icon: Gamepad2,
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
  'This is not a medical device and is not used to diagnose any condition.',
];

export default function HomePage() {
  return (
    <BareShell>
      <section className="grid items-center gap-10 py-12 sm:py-16 lg:grid-cols-2 lg:gap-16 lg:py-24">
        <div className="flex flex-col items-start gap-6">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary-soft px-3 py-1 text-xs font-semibold tracking-wide text-primary uppercase">
            <Sparkles aria-hidden size={14} />
            Webcam exercise game
          </span>

          <h1 className="m-0 text-5xl leading-[1.05] font-bold sm:text-6xl lg:text-7xl">
            Run the trail
            <span className="block text-primary">with your whole body</span>
          </h1>

          <p className="m-0 max-w-xl text-lg leading-relaxed text-muted">
            Trail Runner turns a webcam into a motion controller. Jog in place to attack, step
            sideways to switch lanes, and keep moving to keep going. Every frame is processed in your
            browser — no video is ever uploaded.
          </p>

          <div className="flex flex-col gap-3 self-stretch sm:flex-row sm:self-auto">
            <LinkButton href="/calibrate" variant="primary" size="lg" icon={<Camera size={20} />}>
              Set up your camera
            </LinkButton>
            <LinkButton href="/play" size="lg" icon={<Play size={20} />}>
              Play now
            </LinkButton>
          </div>

          <p className="m-0 text-sm text-subtle">
            No installation, no account. Works in any modern desktop browser with a webcam.
          </p>
        </div>

        <ol className="m-0 flex list-none flex-col gap-3 rounded-xl border border-line bg-surface p-5 sm:p-6">
          <li className="text-xs font-semibold tracking-[0.08em] text-muted uppercase">
            How it works
          </li>
          {STEPS.map((step, index) => (
            <li key={step.title} className="flex gap-4 rounded-lg bg-elevated p-4">
              <span
                aria-hidden
                className="grid size-10 flex-none place-items-center rounded-lg bg-primary-soft text-primary"
              >
                <step.icon size={20} />
              </span>
              <div className="flex flex-col gap-1">
                <h2 className="m-0 text-base font-semibold text-text">
                  <span className="text-primary tabular-nums">{index + 1}.</span> {step.title}
                </h2>
                <p className="m-0 text-sm leading-relaxed text-muted">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="border-t border-line py-12 sm:py-16" aria-labelledby="features-heading">
        <h2 id="features-heading" className="m-0 text-3xl font-bold sm:text-4xl">
          Built to keep you moving
        </h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {FEATURES.map((feature) => (
            <Card key={feature.title} title={feature.title} icon={<feature.icon size={20} />}>
              <p className="m-0 text-sm leading-relaxed text-muted">{feature.body}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="border-t border-line py-12 sm:py-16" aria-labelledby="controls-heading">
        <div className="grid gap-8 lg:grid-cols-[1fr_1.2fr] lg:gap-12">
          <div className="flex flex-col gap-4">
            <h2 id="controls-heading" className="m-0 text-3xl font-bold sm:text-4xl">
              Three movements, that&rsquo;s all
            </h2>
            <p className="m-0 leading-relaxed text-muted">
              The whole game runs on movements you already know. Nothing to memorise, and nothing
              that needs a free hand.
            </p>
            <LinkButton
              href="/how-to-play"
              variant="ghost"
              className="self-start px-0"
              icon={<ArrowRight size={18} />}
              iconPosition="end"
            >
              Read the full guide
            </LinkButton>
          </div>

          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {CONTROLS.map((control) => (
              <li
                key={control.action}
                className="flex items-center gap-4 rounded-xl border border-line bg-surface p-4"
              >
                <span
                  aria-hidden
                  className="grid size-11 flex-none place-items-center rounded-lg bg-elevated text-primary"
                >
                  <control.icon size={22} />
                </span>
                <div className="flex flex-col">
                  <span className="font-semibold text-text">{control.action}</span>
                  <span className="text-sm text-muted">{control.effect}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="border-t border-line py-12 sm:py-16" aria-labelledby="safety-heading">
        <div className="grid gap-4 md:grid-cols-2">
          <Card
            title="Before you start"
            icon={<TriangleAlert size={20} />}
            className="self-start md:col-span-2 lg:col-span-1"
          >
            <h2 id="safety-heading" className="sr-only">
              Safety and privacy
            </h2>
            <ul className="m-0 flex list-none flex-col gap-2 p-0 text-sm text-muted">
              {CAUTIONS.map((item) => (
                <li key={item} className="flex gap-2.5">
                  <span aria-hidden className="mt-2 size-1.5 flex-none rounded-full bg-primary" />
                  {item}
                </li>
              ))}
            </ul>
          </Card>

          <div className="flex flex-col gap-4">
            <Notice tone="ok" title="Your camera feed stays on your device">
              All image processing and pose detection happens in your browser. Video frames are never
              sent to a server and are never stored.
            </Notice>

            <Card
              title="Taking part in the study"
              note="Participant data handling"
              icon={<ShieldCheck size={20} />}
            >
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
          </div>
        </div>
      </section>

      <section className="border-t border-line py-12 sm:py-16">
        <div className="flex flex-col items-center gap-6 rounded-xl border border-line bg-surface px-6 py-12 text-center">
          <span
            aria-hidden
            className="grid size-14 place-items-center rounded-full bg-primary-soft text-primary"
          >
            <Trophy size={26} />
          </span>
          <h2 className="m-0 max-w-lg text-3xl font-bold sm:text-4xl">
            Set your camera up once, then just run
          </h2>
          <p className="m-0 max-w-xl leading-relaxed text-muted">
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
