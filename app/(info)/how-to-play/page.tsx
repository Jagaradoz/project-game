import {
  Camera,
  Footprints,
  Lightbulb,
  Map,
  MoveHorizontal,
  Pause,
  Ruler,
  ShieldCheck,
  Shirt,
  TriangleAlert,
} from 'lucide-react';

import { Card } from '@/components/ui/Card';
import { LinkButton } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';
import { PageShell } from '@/components/ui/PageShell';

/* TOR 3: หน้าแรกและคำแนะนำการใช้งาน -- game details, controls and cautions. */

export const metadata = { title: 'How to Play' };

const CONTROLS = [
  {
    icon: MoveHorizontal,
    move: 'Step or lean left / right',
    effect:
      'The runner switches to that lane immediately. There are three lanes: left, centre and right.',
  },
  {
    icon: Footprints,
    move: 'Jog in place (lift your knees alternately)',
    effect: 'The runner attacks continuously for as long as you keep the rhythm going.',
  },
  {
    icon: Pause,
    move: 'Stand still',
    effect:
      'Attacking stops at once, but the runner keeps moving forward — so you have to keep moving too.',
  },
];

const SETUP = [
  {
    icon: Ruler,
    title: 'Distance',
    body: 'Stand roughly 1.5–2 metres from the camera, close enough that it sees you from head to knee.',
  },
  {
    icon: MoveHorizontal,
    title: 'Space',
    body: 'Keep at least an arm span clear around you so you can step sideways safely.',
  },
  {
    icon: Lightbulb,
    title: 'Lighting',
    body: 'Light your face from the front. Avoid a bright window behind you — backlight hides your outline.',
  },
  {
    icon: Shirt,
    title: 'Clothing',
    body: 'Wear something that shows your outline, and avoid colours that blend into the wall behind you.',
  },
  {
    icon: TriangleAlert,
    title: 'Floor',
    body: 'Clear anything you could trip over, and play on a surface that is not slippery.',
  },
];

export default function HowToPlayPage() {
  return (
    <PageShell
      eyebrow="Guide"
      title="How to Play"
      subtitle="Everything you need before your first run: the controls, how to set up your space, and how progression works."
      width="wide"
      actions={
        <LinkButton href="/calibrate" variant="primary" icon={<Camera size={18} />}>
          Set up your camera
        </LinkButton>
      }
    >
      <p className="m-0 max-w-3xl text-lg leading-relaxed text-muted">
        Your movement is the input. There is nothing to click during a run and no accessory to buy —
        a webcam is the only hardware the game needs.
      </p>

      <div className="flex flex-col gap-4">
        <Card title="Controls" icon={<Footprints size={20} />}>
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {CONTROLS.map((control) => (
              <li key={control.move} className="flex gap-3.5 rounded-md bg-elevated p-3.5">
                <span
                  aria-hidden
                  className="grid size-10 flex-none place-items-center rounded-md bg-accent-soft text-accent"
                >
                  <control.icon size={20} />
                </span>
                <div className="flex flex-col gap-0.5">
                  <span className="font-semibold text-text">{control.move}</span>
                  <span className="text-sm leading-relaxed text-muted">{control.effect}</span>
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Set up your space" icon={<Ruler size={20} />}>
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {SETUP.map((item) => (
              <li key={item.title} className="flex gap-3">
                <item.icon aria-hidden size={18} className="mt-0.5 flex-none text-accent" />
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-semibold text-text">{item.title}</span>
                  <span className="text-sm leading-relaxed text-text/80">{item.body}</span>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* TOR 3: ระบบ Biome และ Stage. */}
      <Card title="Stages and progression" icon={<Map size={20} />}>
        <p className="m-0 max-w-3xl text-sm leading-relaxed text-muted">
          The game is divided into biomes, and each biome holds ten stages. Every stage sets a target
          number of enemies to defeat. Clearing a stage unlocks the next one, and clearing all ten
          unlocks the next biome. You choose your starting difficulty, and you can change it whenever
          you like — easier difficulties give you more health, slower enemies and a smaller target.
        </p>
      </Card>

      <div className="flex flex-col gap-4">
        <Notice tone="warn" title="Safety">
          Stop playing immediately if you feel dizzy, get chest pain, become short of breath or feel
          unusually tired. This is not a medical device and is not used to diagnose any condition.
          The movement count shown is what the system detects, not a clinically validated measure of
          energy expenditure. If you have a pre-existing condition, talk to a doctor before
          exercising.
        </Notice>

        <Notice tone="ok" title="Privacy">
          All image processing and pose detection runs in your browser. Video frames from your camera
          are never sent to a server and are never stored anywhere.
        </Notice>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row">
        <LinkButton
          href="/calibrate"
          variant="primary"
          size="lg"
          icon={<Camera size={20} />}
          className="flex-1"
        >
          Set up your camera
        </LinkButton>
        <LinkButton href="/stages" size="lg" icon={<Map size={20} />} className="flex-1">
          Browse stages
        </LinkButton>
        <LinkButton href="/consent" size="lg" icon={<ShieldCheck size={20} />} className="flex-1">
          Study information
        </LinkButton>
      </div>
    </PageShell>
  );
}
