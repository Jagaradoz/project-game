/**
 * Single source of truth for every tunable value in the app.
 *
 * The detection thresholds below are starting estimates derived from typical
 * body proportions, not measured values. Expect to tune them against your own
 * body and camera placement -- that is why they all live in one file.
 */

/** Pinned so a CDN publishing a breaking release cannot silently break the page. */
export const MEDIAPIPE_VERSION = '1.0.1';

const CDN_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}`;

export const MEDIAPIPE_MODULE_URL = `${CDN_BASE}/vision_bundle.mjs`;
export const MEDIAPIPE_WASM_URL = `${CDN_BASE}/wasm`;

/** Pinned for the same reason as MediaPipe: a CDN release must not move under us. */
export const THREE_VERSION = '0.180.0';
export const THREE_MODULE_URL = `https://cdn.jsdelivr.net/npm/three@${THREE_VERSION}/build/three.module.js`;
export const GLTF_LOADER_URL = `https://cdn.jsdelivr.net/npm/three@${THREE_VERSION}/examples/jsm/loaders/GLTFLoader.js`;
export const SKELETON_UTILS_URL = `https://cdn.jsdelivr.net/npm/three@${THREE_VERSION}/examples/jsm/utils/SkeletonUtils.js`;

const MODEL_BASE = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker';

/** Swap CONFIG.pose.model to compare accuracy vs. speed. */
export const MODEL_URLS = {
  lite: `${MODEL_BASE}/pose_landmarker_lite/float16/1/pose_landmarker_lite.task`,
  full: `${MODEL_BASE}/pose_landmarker_full/float16/1/pose_landmarker_full.task`,
};

/** MediaPipe Pose landmark indices. Left/right are the SUBJECT's own left/right. */
export const LANDMARK = {
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
};

export const CONFIG = {
  camera: {
    idealWidth: 640,
    idealHeight: 480,
    facingMode: 'user',
  },

  pose: {
    model: 'lite',
    numPoses: 1,
    minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
    /** Landmarks scoring below this are treated as missing rather than fed in as noise. */
    minVisibility: 0.5,
  },

  lateral: {
    /** |offset| must exceed this (in shoulder-widths) to enter LEFT/RIGHT. */
    enterOffset: 0.35,
    /** ...and fall below this to return to CENTER. Hysteresis kills boundary flicker. */
    exitOffset: 0.2,
    /** Milliseconds of standing still averaged into the center baseline. */
    calibrationMs: 1000,
    /** EMA weight for the new sample. Lower = smoother but laggier. */
    smoothing: 0.35,
    /**
     * Blend of shoulder midline vs hip midline used as the body's lateral centre.
     * The pelvis swings sideways on every step, so the shoulders carry most of the
     * weight -- that is what keeps LEFT/RIGHT readable while jogging in place.
     * 1 = shoulders only, 0 = hips only.
     */
    shoulderWeight: 0.7,
    /**
     * MediaPipe x is in raw (un-mirrored) camera space, so the subject moving to
     * their OWN left increases x. Flip this if the on-screen label reads backwards.
     */
    invertSides: false,
  },

  jog: {
    /**
     * |kneeDelta| (in torso-lengths) needed to flip the up-knee state machine.
     * Deliberately low: the game asks for a light shuffle, not real knee lifts.
     */
    crossThreshold: 0.035,
    /** A state must also peak above this before its transition counts as a step. */
    peakThreshold: 0.06,
    /** EMA weight for kneeDelta. */
    smoothing: 0.5,
    /** Steps are counted within this trailing window. */
    windowMs: 2500,
    /** Minimum steps inside the window to call it jogging. */
    minStepsInWindow: 2,
    /** Drop back to not-jogging after this long with no step. */
    timeoutMs: 1500,
    /** Plausible human cadence band, in steps per minute. */
    minCadenceSpm: 40,
    maxCadenceSpm: 300,
  },

  fps: {
    /** EMA weight for the new frame delta. */
    smoothing: 0.1,
  },

  draw: {
    boneWidth: 4,
    jointRadius: 5,
    boneColor: '#00e5ff',
    jointColor: '#ffffff',
    /** Joints below CONFIG.pose.minVisibility are drawn in this colour instead. */
    lowConfidenceColor: '#ff4d4d',
  },

  /**
   * Endless 3-lane runner. World units are arbitrary but consistent: one lane is
   * `laneWidth` wide, the player sits at z = playerZ, and enemies travel in +z
   * (towards the camera). Lane index 0 = left, 1 = centre, 2 = right.
   */
  game: {
    laneCount: 3,
    laneWidth: 2.4,

    /** Shadow map budget. 'high' | 'medium' | 'low' (low disables shadows). */
    quality: 'high',

    /**
     * How far the dirt's edge wanders, in world units. Purely a vertex-shader
     * displacement -- the path runs dead straight and the lanes stay exactly
     * where the reducer puts them; only the boundary between dirt and grass
     * moves. `meander + pinch` must stay under the trail's margin over the
     * lanes, or the outer lane ends up on grass.
     */
    trailEdge: {
      meander: 0.55,
      pinch: 0.35,
      falloff: 6,
    },

    playerRadius: 0.75,
    playerZ: 0,
    enemyRadius: 0.65,

    /** Enemies appear here and are retired once past despawnZ, behind the player. */
    spawnZ: -85,
    despawnZ: 8,

    /**
     * The march is constant -- the player is always walking forward. Jogging
     * decides whether they SHOOT, not whether they move.
     */
    walkSpeed: 11,
    maxSpeed: 18,
    /** The ramp eases in over this long rather than snapping to a new speed. */
    speedLerpMs: 400,

    /** Bullets only leave the barrel while the body is jogging. */
    bulletSpeed: 46,
    bulletRadius: 0.18,
    fireIntervalMs: 190,
    bulletPoolSize: 40,

    spawnIntervalMs: 1600,
    minSpawnIntervalMs: 850,
    /** Odds a spawn row gets a second enemy, once the ramp is under way. */
    doubleSpawnChance: 0.2,
    /** Never fill a row: one lane must always be survivable. */
    maxLanesPerRow: 2,
    /** Distance travelled before speed and spawn rate reach their hardest values. */
    rampDistance: 1400,

    maxHp: 3,
    /** Grace period after a hit, so one pile-up cannot drain the bar. */
    invulnMs: 1200,
    /** Frames longer than this (tab switch, GC pause) are clamped to it. */
    maxFrameMs: 50,

    /** Enough meshes for the worst case; the pool is never grown at runtime. */
    enemyPoolSize: 24,

    enemy: {
      path: './assets/models/characters/Skeleton_Minion.glb',
      scale: 1.15,
      /** Rigs in this pack face +z, which is towards the player. */
      rotationY: 0,
      animations: {
        run: 'Running_A',
        walk: 'Walking_D_Skeletons',
        death: 'Death_A',
      },
      /**
       * Skinning is the expensive part of a crowd, so only the nearest few are
       * animated. Past this the pose is frozen, which is invisible at distance.
       */
      animatedCount: 8,
      animateBeyondZ: -70,
      /** Bodies staged for the death animation, separate from the live pool. */
      corpseCount: 5,
    },

    /** Trail stones marking the lane boundaries. */
    markerCount: 26,
    markerLength: 3,
    markerGap: 6,

    /**
     * Framed for a portrait screen: far enough back that the outer lanes stay
     * inside a narrow viewport, aimed far enough ahead to show oncoming traffic.
     */
    camera: {
      fov: 62,
      x: 0,
      y: 6.9,
      z: 12.8,
      lookAtY: 1.6,
      lookAtZ: -30,
    },

    /**
     * Scatter repeats every `span` metres. Bigger spans hide the repetition for
     * longer at the cost of more instances resident at once.
     */
    scenery: {
      span: 320,
      seed: 24289,
    },

    characters: {
      knight: {
        id: 'knight',
        name: 'Knight',
        path: './assets/models/characters/Knight.glb',
        scale: 1.25,
        rotationY: Math.PI,
        offsetY: 0,
        /**
         * Character packs ship every weapon and shield in one file, all
         * visible. This is the loadout: everything else is switched off.
         */
        hideParts: [
          '1H_Sword_Offhand',
          'Badge_Shield',
          'Rectangle_Shield',
          'Spike_Shield',
          '2H_Sword',
          // Seen from behind, the cape is a solid blob over the whole run cycle.
          'Knight_Cape',
        ],
        /** Cloned out of the model to become the thrown projectile. */
        projectilePart: '1H_Sword',
        animations: {
          run: 'Running_A',
          walk: 'Walking_A',
          idle: 'Idle',
          shoot: 'Throw',
          death: 'Death_A',
          hit: 'Hit_A',
        },
      },
      rogue: {
        id: 'rogue',
        name: 'Rogue',
        path: './assets/models/characters/Rogue.glb',
        scale: 1.25,
        rotationY: Math.PI,
        offsetY: 0,
        hideParts: [
          'Knife_Offhand',
          '1H_Crossbow',
          '2H_Crossbow',
          'Throwable',
          'Rogue_Cape',
        ],
        projectilePart: 'Knife',
        animations: {
          run: 'Running_A',
          walk: 'Walking_A',
          idle: 'Idle',
          shoot: 'Throw',
          death: 'Death_A',
          hit: 'Hit_A',
        },
      },
      rogueHooded: {
        id: 'rogueHooded',
        name: 'Hooded Rogue',
        path: './assets/models/characters/Rogue_Hooded.glb',
        scale: 1.25,
        rotationY: Math.PI,
        offsetY: 0,
        hideParts: [
          'Knife_Offhand',
          '1H_Crossbow',
          '2H_Crossbow',
          'Throwable',
          'Rogue_Cape',
        ],
        projectilePart: 'Knife',
        animations: {
          run: 'Running_A',
          walk: 'Walking_A',
          idle: 'Idle',
          shoot: 'Throw',
          death: 'Death_A',
          hit: 'Hit_A',
        },
      },
      mage: {
        id: 'mage',
        name: 'Mage',
        path: './assets/models/characters/Mage.glb',
        scale: 1.25,
        rotationY: Math.PI,
        offsetY: 0,
        hideParts: [
          'Spellbook',
          'Spellbook_open',
          '2H_Staff',
          'Mage_Cape',
        ],
        /** No blade to throw: the mage gets the default bolt, which reads as a spell. */
        animations: {
          run: 'Running_A',
          walk: 'Walking_A',
          idle: 'Idle',
          shoot: 'Throw',
          death: 'Death_A',
          hit: 'Hit_A',
        },
      },
      barbarian: {
        id: 'barbarian',
        name: 'Barbarian',
        path: './assets/models/characters/Barbarian.glb',
        scale: 1.25,
        rotationY: Math.PI,
        offsetY: 0,
        hideParts: [
          '1H_Axe_Offhand',
          'Barbarian_Round_Shield',
          '2H_Axe',
          'Mug',
          'Barbarian_Cape',
        ],
        projectilePart: '1H_Axe',
        animations: {
          run: 'Running_A',
          walk: 'Walking_A',
          idle: 'Idle',
          shoot: 'Throw',
          death: 'Death_A',
          hit: 'Hit_A',
        },
      },
      robot: {
        id: 'robot',
        name: 'Expressive Robot',
        path: './assets/models/RobotExpressive.glb',
        scale: 0.8,
        rotationY: Math.PI,
        offsetY: 0,
        animations: {
          run: 'Running',
          walk: 'Walking',
          idle: 'Idle',
          shoot: 'Punch',
          death: 'Death',
          jump: 'Jump',
          wave: 'Wave',
        },
      },
      xbot: {
        id: 'xbot',
        name: 'Cyber X-Bot',
        path: './assets/models/Xbot.glb',
        scale: 1.15,
        rotationY: Math.PI,
        offsetY: 0,
        animations: {
          run: 'run',
          walk: 'walk',
          idle: 'idle',
          shoot: 'agree',
          death: 'sad_pose',
        },
      },
      soldier: {
        id: 'soldier',
        name: 'Tactical Soldier',
        path: './assets/models/Soldier.glb',
        scale: 1.2,
        rotationY: Math.PI,
        offsetY: 0,
        animations: {
          run: 'Run',
          walk: 'Walk',
          idle: 'Idle',
          shoot: 'TPose',
          death: 'Idle',
        },
      },
      orb: {
        id: 'orb',
        name: 'Energy Orb',
        path: null,
        scale: 1.0,
      },
    },
    defaultCharacter: 'knight',
  },
};
