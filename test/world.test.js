import test from 'node:test';
import assert from 'node:assert/strict';

import { CONFIG } from '../src/config.js';
import { trailEdgeReach, trailEdgeOffsetAt } from '../src/game/world/trailEdge.js';
import { trailHalfWidth } from '../src/game/world/ground.js';

const game = CONFIG.game;
/** x of the outermost lane's outer boundary -- the edge must never cross this. */
const laneEdge = (game.laneCount * game.laneWidth) / 2;
const settings = { ...game.trailEdge, halfWidth: trailHalfWidth(game) };

/** Where the dirt actually ends on one side, after the shader's displacement. */
const lipAt = (side, z, scroll) => {
  const nominal = side * settings.halfWidth;
  return Math.abs(nominal + trailEdgeOffsetAt(nominal, z, settings, scroll));
};

test('trail edge: the dirt is wider than the play area by more than the edge can wander', () => {
  // Arrange / Act
  const margin = trailHalfWidth(game) - laneEdge;
  const reach = trailEdgeReach(game.trailEdge);

  // Assert
  assert.ok(
    margin > reach,
    `dirt margin ${margin.toFixed(2)} must exceed worst-case wander ${reach.toFixed(2)}`,
  );
});

test('trail edge: a lane never ends up on grass, anywhere along the run', () => {
  let tightest = Infinity;

  // Sweep both the shape and the scroll: the pattern slides past as you travel,
  // so a z that is safe at the start of a run is not safe by construction later.
  for (let scroll = 0; scroll < 4000; scroll += 37) {
    for (let z = -600; z <= 100; z += 0.5) {
      tightest = Math.min(tightest, lipAt(1, z, scroll), lipAt(-1, z, scroll));
    }
  }

  assert.ok(
    tightest > laneEdge,
    `tightest edge ${tightest.toFixed(3)} must stay outside the lane boundary ${laneEdge}`,
  );
});

test('trail edge: both sides wander, and not identically', () => {
  const samples = [];
  for (let z = -400; z <= 0; z += 3) {
    samples.push({ right: lipAt(1, z, 0), left: lipAt(-1, z, 0) });
  }

  const spread = (values) => Math.max(...values) - Math.min(...values);
  const rightSpread = spread(samples.map((s) => s.right));
  const leftSpread = spread(samples.map((s) => s.left));
  const asymmetry = Math.max(...samples.map((s) => Math.abs(s.right - s.left)));

  // A ruler-straight edge is the thing this exists to prevent.
  assert.ok(rightSpread > 0.5, `right edge barely moves (${rightSpread.toFixed(3)})`);
  assert.ok(leftSpread > 0.5, `left edge barely moves (${leftSpread.toFixed(3)})`);
  // Mirror-image edges would read as a machined ribbon rather than a worn path.
  assert.ok(asymmetry > 0.1, `edges move in lockstep (${asymmetry.toFixed(3)})`);
});

test('trail edge: the displacement dies away at the trail centre and out in the bank', () => {
  const settle = (x) => Math.abs(trailEdgeOffsetAt(x, -120, settings, 0));

  assert.ok(settle(0) < 1e-6, 'the centre of the trail must not move');
  assert.ok(settle(settings.halfWidth + settings.falloff + 1) < 1e-6, 'the bank must not move');
  assert.ok(settle(settings.halfWidth) > settle(settings.halfWidth * 0.4), 'the lip should move most');
});
