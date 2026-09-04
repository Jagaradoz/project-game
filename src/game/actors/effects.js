/**
 * Transient hit effects.
 *
 * A burst of bone chips on a kill, as one InstancedMesh: a pool of separate
 * meshes would cost a draw call each at exactly the moment the screen is
 * busiest. Slots are claimed round-robin, so an overlapping burst recycles the
 * oldest chips rather than searching for free ones.
 *
 * Chips travel with the world as well as under their own velocity, so they
 * settle onto the trail and scroll away instead of hanging in mid-air.
 */

const CHIP_COUNT = 72;
const CHIPS_PER_BURST = 9;
const CHIP_LIFE_SEC = 0.9;
const GRAVITY = -14;
const HIDDEN_SCALE = 0.0001;

export function createEffects(THREE, scene, palette) {
  const geometry = new THREE.OctahedronGeometry(0.11, 0);
  const material = new THREE.MeshStandardMaterial({
    color: palette.accents.enemy,
    roughness: 0.8,
    metalness: 0,
    flatShading: true,
  });

  const mesh = new THREE.InstancedMesh(geometry, material, CHIP_COUNT);
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  scene.add(mesh);

  const chips = Array.from({ length: CHIP_COUNT }, () => ({
    life: 0,
    position: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
    spin: new THREE.Vector3(),
    rotation: new THREE.Euler(),
  }));

  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  let nextSlot = 0;

  // Everything starts hidden; a zero-scale instance costs nothing to draw.
  scale.setScalar(HIDDEN_SCALE);
  for (let index = 0; index < CHIP_COUNT; index += 1) {
    matrix.compose(chips[index].position, quaternion, scale);
    mesh.setMatrixAt(index, matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;

  return {
    mesh,

    burst(x, y, z) {
      for (let count = 0; count < CHIPS_PER_BURST; count += 1) {
        const chip = chips[nextSlot];
        nextSlot = (nextSlot + 1) % CHIP_COUNT;

        chip.life = CHIP_LIFE_SEC;
        chip.position.set(x, y, z);
        chip.velocity.set(
          (Math.random() - 0.5) * 7,
          2.5 + Math.random() * 5,
          (Math.random() - 0.5) * 7,
        );
        chip.spin.set(Math.random() * 12 - 6, Math.random() * 12 - 6, Math.random() * 12 - 6);
        chip.rotation.set(Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28);
      }
    },

    update(dtSec, worldSpeed = 0) {
      let dirty = false;

      for (let index = 0; index < CHIP_COUNT; index += 1) {
        const chip = chips[index];
        if (chip.life <= 0) continue;

        chip.life -= dtSec;
        chip.velocity.y += GRAVITY * dtSec;
        chip.position.addScaledVector(chip.velocity, dtSec);
        // Carried along by the run, like everything else on the trail.
        chip.position.z += worldSpeed * dtSec;
        chip.rotation.x += chip.spin.x * dtSec;
        chip.rotation.y += chip.spin.y * dtSec;
        chip.rotation.z += chip.spin.z * dtSec;

        const alive = chip.life > 0 && chip.position.y > -0.5;
        quaternion.setFromEuler(chip.rotation);
        scale.setScalar(alive ? 1 : HIDDEN_SCALE);
        if (!alive) chip.life = 0;

        matrix.compose(chip.position, quaternion, scale);
        mesh.setMatrixAt(index, matrix);
        dirty = true;
      }

      if (dirty) mesh.instanceMatrix.needsUpdate = true;
    },

    applyPalette(next) {
      material.color.set(next.accents.enemy);
    },
  };
}
