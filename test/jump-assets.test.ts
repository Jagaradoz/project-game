import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

test.each(['Mage', 'Druid', 'SkeletonMage', 'Witch', 'MagicalGirl'])('%s jump leaves airborne translation to gameplay', (name) => {
  const blob = readFileSync(new URL(`../public/assets/models/characters/animated/${name}.glb`, import.meta.url));
  const jsonLength = blob.readUInt32LE(12);
  const doc = JSON.parse(blob.subarray(20, 20 + jsonLength).toString());
  const binary = blob.subarray(28 + jsonLength);
  const rootIndex = doc.nodes.findIndex((node: { name?: string }) => node.name === 'root');
  expect(rootIndex).toBeGreaterThanOrEqual(0);
  const jump = doc.animations.find((clip: { name: string }) => clip.name === 'Jump');
  expect(jump).toBeDefined();
  const channels = jump.channels.filter((channel: { target: { node: number; path: string } }) =>
    channel.target.node === rootIndex && channel.target.path === 'translation');
  // Constant tracks may be omitted by glTF optimization; if present, they must
  // stay constant in every axis rather than add another jump to the game arc.
  for (const channel of channels) {
    const accessor = doc.accessors[jump.samplers[channel.sampler].output];
    expect(accessor.type).toBe('VEC3');
    expect(accessor.componentType).toBe(5126);
    const view = doc.bufferViews[accessor.bufferView];
    const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    for (let axis = 0; axis < 3; axis++) {
      const samples = Array.from({ length: accessor.count }, (_, row) =>
        binary.readFloatLE(start + row * (view.byteStride ?? 12) + axis * 4));
      expect(samples.every(Number.isFinite)).toBe(true);
      expect(Math.max(...samples) - Math.min(...samples)).toBeLessThan(1e-5);
    }
  }
});
