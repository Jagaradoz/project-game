/**
 * Single source of truth for every tunable value in the app.
 *
 * The detection thresholds below are starting estimates derived from typical
 * body proportions, not measured values. Expect to tune them against your own
 * body and camera placement -- that is why they all live in one file.
 */

/**
 * The MediaPipe JS runtime is a real npm dependency now, but its WASM binaries
 * and the .task model still have to be fetched at runtime. Both stay pinned to
 * the exact package version so a CDN release cannot move under us -- keep this
 * in step with `@mediapipe/tasks-vision` in package.json.
 */
export const MEDIAPIPE_VERSION = '1.0.1';

const CDN_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}`;

export const MEDIAPIPE_WASM_URL = `${CDN_BASE}/wasm`;

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

  jump: {
    calibrationMs: 900,
    hipRise: 0.18,
    footRise: 0.16,
    confirmMs: 35,
    landingMs: 180,
    missingResetMs: 300,
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
  /**
   * Pre-flight checks for /calibrate, per TOR 3 (ระบบปรับเทียบกล้อง): the player
   * is not let into a run until the camera can actually see them.
   *
   * Distance is inferred from shoulder width as a fraction of the frame. It is
   * the only distance cue a single webcam gives for free, and it is enough to
   * separate "too far to track" from "too close to fit".
   */
  calibration: {
    /** Mean luma, 0..1. Below is too dim to track; above is blown out. */
    minLuma: 0.18,
    maxLuma: 0.93,
    /** Shoulder width as a fraction of frame width. */
    minShoulderWidth: 0.1,
    maxShoulderWidth: 0.45,
    /** Exposure is a slow signal; sampling it every frame is wasted work. */
    sampleIntervalMs: 400,
    /** Downsample size for the luma sample. Small is the point: it is an average. */
    sampleWidth: 32,
    sampleHeight: 24,
    /** A rehearsal step counts once the player has held the pose this long. */
    rehearsalHoldMs: 250,
  },

  /**
   * Stage and difficulty, per TOR 3 (ระบบ Biome และ Stage, ระบบเกมและศัตรู).
   *
   * These are multipliers rather than absolute values so there is still exactly
   * one place that says how fast the runner moves or how often enemies spawn --
   * `game` below. A stage bends those numbers; it never restates them.
   *
   * `goalKills` is what turns the endless runner into a stage: clear that many
   * enemies and the stage is passed. It grows with the stage number so stage 10
   * is a real step up from stage 1, and with the biome so a later biome is
   * harder at the same stage number.
   */
  stage: {
    /** Kills to clear stage 1 of the first biome. */
    baseGoalKills: 12,
    /** Added per stage within a biome, and per biome already travelled. */
    goalKillsPerStage: 3,
    goalKillsPerBiome: 6,

    difficulty: {
      easy: {
        label: 'Easy',
        /** Longer gaps between spawn rows. */
        spawnIntervalScale: 1.35,
        /** A gentler top speed. */
        maxSpeedScale: 0.85,
        /** Reaching the hardest settings takes longer. */
        rampDistanceScale: 1.4,
        /** TOR 5.1 non-punitive design: an easier run forgives more mistakes. */
        maxHpBonus: 1,
        goalKillsScale: 0.75,
      },
      normal: {
        label: 'Normal',
        spawnIntervalScale: 1,
        maxSpeedScale: 1,
        rampDistanceScale: 1,
        maxHpBonus: 0,
        goalKillsScale: 1,
      },
      hard: {
        label: 'Hard',
        spawnIntervalScale: 0.78,
        maxSpeedScale: 1.15,
        rampDistanceScale: 0.75,
        maxHpBonus: 0,
        goalKillsScale: 1.3,
      },
    },

    /** Per stage within a biome, compounding: stage 10 spawns noticeably faster. */
    spawnIntervalPerStage: 0.97,
    maxSpeedPerStage: 1.012,
  },

  game: {
    laneCount: 3,
    laneWidth: 2.4,

    /** Shadow map budget. 'high' | 'medium' | 'low' (low disables shadows). */
    quality: 'high' as 'high' | 'medium' | 'low',

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
    enemyRadius: 1,

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

    jump: {
      durationMs: 800, height: 2.4, clearance: 1.2,
      // Source Jump frames 4-13 contain flight; 13-19 absorb landing.
      takeoffPose: 4 / 19, landingPose: 13 / 19,
    },
    obstacle: {
      firstMs: 8500, intervalMs: 8500, radius: 0.7, poolSize: 4,
      riverRadius: 1.5,
      logWeight: 0.4, stoneWeight: 0.4, riverWeight: 0.2,
      drowningMs: 650,
    },
    boss: { triggerKills: 12, holdZ: -20, attackIntervalMs: 2800, telegraphMs: 1100 },
    /**
     * Heights are matched to the player (the mage stands ~3.7 with hat). approachSpeed is relative
     * to the scrolling ground and must stay positive: a negative value makes the enemy back away
     * while its Walk/Run clip steps forward.
     */
    enemyTypes: {
      weak: { name: 'Goblin Scout', path: '/assets/models/enemies/animated/GoblinScout.glb', hp: 1, approachSpeed: 3.5, height: 3.4, radius: 1, color: '#9bdd66' },
      normal: { name: 'Bramble Skeleton', path: '/assets/models/enemies/animated/BrambleSkeleton.glb', hp: 2, approachSpeed: 2, height: 3.7, radius: 1.05, color: '#e5d7b1' },
      tank: { name: 'Shroom Brute', path: '/assets/models/enemies/animated/ShroomBrute.glb', hp: 6, approachSpeed: 1, height: 3.9, radius: 1.3, color: '#e9a15b' },
      boss: { name: 'Elder Treant', path: '/assets/models/enemies/animated/ElderTreant.glb', hp: 40, approachSpeed: 0, height: 8, radius: 2, color: '#df7650' },
    },

    enemy: {
      path: '/assets/models/characters/Skeleton_Minion.glb',
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
      // Keeps the recycle seam (camera z + span - 20) beyond the fog's far edge.
      span: 160,
      seed: 24289,
    },

    characters: {
      mage: {
        id: 'mage',
        name: 'Mage',
        path: '/assets/models/characters/animated/Mage.glb',
        scale: 1.25,
        rotationY: Math.PI,
        offsetY: 0,
        /** No blade to throw: the mage gets the default bolt, which reads as a spell. */
        animations: {
          run: 'Run',
          shoot: 'Attack',
          hit: 'Hit', death: 'Death', jump: 'Jump', idle: 'Idle',
        },
      },
      druid: {
        id: 'druid', name: 'Druid',
        path: '/assets/models/characters/animated/Druid.glb',
        scale: 1.25, rotationY: Math.PI, offsetY: 0,
        animations: { run: 'Run', shoot: 'Attack', hit: 'Hit', death: 'Death', jump: 'Jump', idle: 'Idle' },
      },
      skeletonMage: {
        id: 'skeletonMage', name: 'Skeleton Mage',
        path: '/assets/models/characters/animated/SkeletonMage.glb',
        scale: 1.25, rotationY: Math.PI, offsetY: 0,
        animations: { run: 'Run', shoot: 'Attack', hit: 'Hit', death: 'Death', jump: 'Jump', idle: 'Idle' },
      },
      witch: {
        id: 'witch', name: 'Witch',
        path: '/assets/models/characters/animated/Witch.glb',
        scale: 1.25, rotationY: Math.PI, offsetY: 0,
        animations: { run: 'Run', shoot: 'Attack', hit: 'Hit', death: 'Death', jump: 'Jump', idle: 'Idle' },
      },
      magicalGirl: {
        id: 'magicalGirl', name: 'Magical Girl',
        path: '/assets/models/characters/animated/MagicalGirl.glb',
        scale: 1.25, rotationY: Math.PI, offsetY: 0,
        animations: { run: 'Run', shoot: 'Attack', hit: 'Hit', death: 'Death', jump: 'Jump', idle: 'Idle' },
      },
    },
    defaultCharacter: 'mage',
  },
};
