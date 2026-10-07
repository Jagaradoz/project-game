import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

interface Doc {
  nodes: { name?: string }[];
  accessors: { bufferView: number; byteOffset?: number; count: number; type: string }[];
  bufferViews: { byteOffset?: number }[];
  animations: { name: string; channels: { sampler: number; target: { node: number; path: string } }[];
    samplers: { input: number; output: number; interpolation?: string }[] }[];
}
const WIDTH: Record<string, number> = { SCALAR: 1, VEC3: 3, VEC4: 4 };

function load(name: string) {
  const blob = readFileSync(new URL(`../public/assets/models/enemies/animated/${name}.glb`, import.meta.url));
  const jsonLength = blob.readUInt32LE(12);
  const doc = JSON.parse(blob.subarray(20, 20 + jsonLength).toString()) as Doc;
  const binary = blob.subarray(28 + jsonLength);
  const rows = (index: number) => {
    const accessor = doc.accessors[index]!, width = WIDTH[accessor.type]!;
    const start = (doc.bufferViews[accessor.bufferView]!.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    return Array.from({ length: accessor.count }, (_, row) =>
      Array.from({ length: width }, (_, c) => binary.readFloatLE(start + (row * width + c) * 4)));
  };
  return { doc, rows };
}

/** Largest per-component gap; q and -q are the same rotation. */
function gap(a: number[], b: number[]) {
  const direct = Math.max(...a.map((v, i) => Math.abs(v - b[i]!)));
  return a.length === 4 ? Math.min(direct, Math.max(...a.map((v, i) => Math.abs(v + b[i]!)))) : direct;
}

test.each(['GoblinScout', 'BrambleSkeleton', 'ShroomBrute', 'ElderTreant'])(
  '%s clips never snap to a different pose for a single sample', (name) => {
    const { doc, rows } = load(name);
    for (const clip of doc.animations) for (const channel of clip.channels) {
      const sampler = clip.samplers[channel.sampler]!;
      if (sampler.interpolation === 'STEP') continue;
      const values = rows(sampler.output);
      for (let i = 1; i < values.length - 1; i++) {
        // A rest-pose snap jumps ~.6 and straight back; authored knee dips stay near .1.
        const spike = gap(values[i]!, values[i - 1]!) > .25 && gap(values[i]!, values[i + 1]!) > .25
          && gap(values[i - 1]!, values[i + 1]!) < .05;
        expect(spike, `${clip.name} ${doc.nodes[channel.target.node]!.name}.${channel.target.path} sample ${i}`).toBe(false);
      }
    }
  });
