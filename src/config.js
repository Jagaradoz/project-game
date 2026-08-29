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
    /** Paved margin outside the outer lanes, purely cosmetic. */
    shoulderWidth: 1.2,
    roadLength: 220,

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

    dashCount: 26,
    dashLength: 3,
    dashGap: 6,
    dashWidth: 0.18,

    /**
     * Framed for a portrait screen: far enough back that the outer lanes stay
     * inside a narrow viewport, aimed far enough ahead to show oncoming traffic.
     */
    camera: {
      fov: 62,
      x: 0,
      y: 7.5,
      z: 13.5,
      lookAtY: 1.2,
      lookAtZ: -28,
    },

    scenery: {
      span: 260,
      itemCount: 64,
      mountainCount: 16,
      segmentCount: 22,
      segmentLength: 12,
      fireflyCount: 24,
    },

    characters: {
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
    defaultCharacter: 'robot',

    colors: {
      sky: '#0b2024',
      fog: '#091c1f',
      road: '#3a2e24',
      roadEdge: '#2b211a',
      curbLight: '#3a5843',
      curbDark: '#4d3425',
      terrain: '#143823',
      terrainFaceted: '#1a432b',
      terrainDeep: '#0d2618',
      dash: '#4ade80',
      treeTrunk: '#42281a',
      birchTrunk: '#e2e8f0',
      birchNotch: '#1e293b',
      treeFoliage: '#15803d',
      treeFoliageAlt: '#166534',
      treeFoliageWarm: '#22c55e',
      treeFoliageBirch: '#84cc16',
      bushFoliage: '#10b981',
      rock: '#475569',
      rockAlt: '#334155',
      rockMoss: '#2d6a4f',
      logWood: '#543622',
      logRings: '#d4a373',
      shroomCap: '#dc2626',
      shroomStem: '#fef08a',
      waypostWood: '#3a2417',
      lanternGlow: '#fbbf24',
      firefly: '#86efac',
      mountain: '#112b25',
      mountainPeak: '#1c3e35',
      player: '#2563eb',
      enemy: '#ef4444',
      bullet: '#22c55e',
    },
  },
};
