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
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
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

  /**
   * Both arms raised overhead = jump. A low-impact stand-in for the body jump,
   * so older players can clear obstacles without leaving the floor.
   */
  armsUp: {
    /** Each wrist must sit this far above the shoulder line, in torso-lengths. */
    minRise: 0.15,
    /** Held this long before it counts, so a passing hand does not fire it. */
    confirmMs: 120,
    /** Both wrists must be back below the shoulders this long to rearm. */
    rearmMs: 200,
  },

  /**
   * Hands on hips (ท้าวเอว) = shield, held for as long as the pose is held.
   * What separates it from arms hanging loose is the elbow: on the hips it
   * juts out sideways, hanging it sits straight above the wrist.
   */
  handsOnHips: {
    /** Wrist within this distance of its own hip, in torso-lengths. */
    maxHipDist: 0.5,
    /** Elbow further from the body midline than the wrist, in shoulder-widths. */
    minElbowOut: 0.25,
    /** Pose held this long before the shield goes up... */
    enterMs: 300,
    /** ...and broken this long before it drops. Hysteresis kills flicker. */
    exitMs: 250,
    /** Hands over the hips lower their confidence; accept arms and hips down to this. */
    minVisibility: 0.3,
    /** Last good hip positions are reused this long while the hands hide them. */
    occlusionHoldMs: 1500,
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
   * Training mode: the one run the game offers. A single forest stage with a
   * kill goal and the boss at the end -- no stage ladder and no difficulty
   * picker. How hard it gets is `game` below, nothing else.
   */
  training: {
    /** Kills to clear the run, the boss included. */
    goalKills: 12,
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
      /**
       * Render-only multipliers on the Blender-authored log/stone meshes; collision still uses radius.
       * Width stays 1 because the meshes already span their lanes, and height must stay under
       * jump.clearance (logs are authored up to ~1.25 tall, stones up to ~0.95) or the jump reads as clipping.
       */
      visualScale: {
        log: { height: 1, depth: 1.6 },
        stones: { height: 1.35, depth: 1.7 },
      },
    },
    /**
     * Poison spore clouds. One fills every lane for `length` units, so the
     * only answer is the hands-on-hips shield; standing in one unshielded costs
     * 1 HP every `tickMs`. No enemies or trail hazards spawn while one is ahead
     * of the player -- shielding means not shooting, and it must not be punished.
     */
    spore: {
      firstMs: 30000, intervalMs: 45000,
      length: 60, tickMs: 1500, entryGraceMs: 600,
      /** Trail hazards must be at least this far ahead of the spawn line. */
      spawnClearance: 25,
      /** HUD warning starts this far before the front edge reaches the player. */
      warnDistance: 45,
    },
    boss: { triggerKills: 12, holdZ: -20, attackIntervalMs: 2800, telegraphMs: 1100 },
    /**
     * Heights are matched to the player (the mage stands ~3.7 with hat). approachSpeed is relative
     * to the scrolling ground and must stay positive: a negative value makes the enemy back away
     * while its Walk clip steps forward. walkRate is the Walk clip's playback speed, so the
     * faster kinds stride quicker instead of gliding.
     */
    enemyTypes: {
      weak: { name: 'Goblin Scout', path: '/assets/models/enemies/animated/GoblinScout.glb', hp: 1, approachSpeed: 3.5, walkRate: 1.6, height: 3.4, radius: 1, color: '#9bdd66' },
      normal: { name: 'Bramble Skeleton', path: '/assets/models/enemies/animated/BrambleSkeleton.glb', hp: 2, approachSpeed: 2, walkRate: 1.25, height: 3.7, radius: 1.05, color: '#e5d7b1' },
      tank: { name: 'Shroom Brute', path: '/assets/models/enemies/animated/ShroomBrute.glb', hp: 6, approachSpeed: 1, walkRate: 1, height: 3.9, radius: 1.3, color: '#e9a15b' },
      boss: { name: 'Elder Treant', path: '/assets/models/enemies/animated/ElderTreant.glb', hp: 40, approachSpeed: 0, walkRate: 1, height: 8, radius: 2, color: '#df7650' },
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
       * animated. animateBeyondZ sits behind spawnZ: enemies are well inside the
       * fog line when they appear, and most die out there, so a frozen pose shows.
       */
      animatedCount: 12,
      animateBeyondZ: -95,
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
