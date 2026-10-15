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
    crossThreshold: 0.025,
    /** Noise gate: a state must reach this amplitude before its transition counts. */
    peakThreshold: 0.05,
    /** EMA weight for kneeDelta. Responsive enough for 180 steps/min at 15 fps. */
    smoothing: 0.65,
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
   * Legacy arm-raise detector settings, retained for standalone detector tests.
   * Production jump control uses the overhead clap detector below.
   */
  armsUp: {
    /** Each wrist must sit this far above the shoulder line, in torso-lengths. */
    minRise: 0.15,
    /** Held this long before it counts, so a passing hand does not fire it. */
    confirmMs: 120,
    /** Both wrists must be back below the shoulders this long to rearm. */
    rearmMs: 200,
  },

  /** Overhead clap: open hands must come together above the head, then separate. */
  clap: {
    minRise: 0.4,
    closeDistanceSw: 0.45,
    openDistanceSw: 0.8,
    confirmMs: 40,
    rearmMs: 120,
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

  /** Test Mode's guided error-rate trial, run once per pose. */
  trial: {
    attempts: 10,
    /** A prompt with no matching detection inside this window counts as missed. */
    attemptMs: 5000,
    /** Pause between prompts; detections here are not scored. */
    restMs: 1500,
    /** Pass when at most this share of attempts is missed or wrong. */
    maxErrorPercent: 10,
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
   * One continuous game scene, with a 20-minute milestone and optional continued
   * play. Health loss or manual finish ends the run. Bosses recur by kill count.
   */

  game: {
    goalMs: 20 * 60 * 1000,
    difficultyIntervalMs: 4 * 60 * 1000,
    cadenceForMaxSpeed: 180,
    maxCadenceSpeed: 11,
    movementPointsPerSecond: 1,
    obstaclePoints: 10,
    laneCount: 3,
    laneWidth: 2.4,

    /** Default graphics budget; the player's in-memory preset overrides this. */
    quality: 'medium' as 'high' | 'medium' | 'low',

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
     * Legacy keyboard/headless walking speed. Production pose control uses
     * cadenceForMaxSpeed/maxCadenceSpeed and sets speed to zero when idle.
     */
    walkSpeed: 11,
    /** The walk eases up from a standstill over this long at the start of a run, then holds. */
    speedLerpMs: 400,

    /** Production knee steps emit one projectile each; dev input may hold fire. */
    bulletSpeed: 46,
    bulletRadius: 0.18,
    fireIntervalMs: 190,
    /** The visible hit chain resets after this long without a landed shot. */
    hitCombo: { timeoutMs: 5000 },
    bulletPoolSize: 40,

    spawnIntervalMs: 1400,
    minSpawnIntervalMs: 600,
    /** Odds a spawn row gets a second enemy, once the ramp is under way. */
    doubleSpawnChance: 0.9,
    /** Late stages mostly fill all three lanes; other late rows fill two. */
    tripleSpawnChance: { stage4: 0.8, stage5: 0.95 },
    maxLanesPerRow: 3,
    /** Sets the five-stage spawn ramp's duration at walkSpeed. Speed stays constant. */
    rampDistance: 1400,

    maxHp: 3,
    /** Grace period after a hit, so one pile-up cannot drain the bar. */
    invulnMs: 1200,
    /** Frames longer than this (tab switch, GC pause) are clamped to it. */
    maxFrameMs: 50,

    /** Enough meshes for the worst case; the pool is never grown at runtime. */
    enemyPoolSize: 42,

    jump: {
      durationMs: 800, height: 2.4,
      // Source Jump frames 4-13 contain flight; 13-19 absorb landing.
      takeoffPose: 4 / 19, landingPose: 13 / 19,
      /**
       * Built for beginners: any jump overlapping a hazard's crossing clears it, whatever its height.
       * These stretch that window for pose-detection latency (see core/hazards.ts advanceHazards).
       */
      leniency: { takeoffGraceMs: 250, landingGraceMs: 200 },
    },
    obstacle: {
      firstMs: 8500, intervalMs: 8500, radius: 0.7, poolSize: 4,
      /**
       * Half the river's width along the trail. A river is only cleared by a jump
       * still in the air as its far bank passes (core/hazards.ts), so wider is harder.
       */
      riverRadius: 2.5,
      // Relative odds per spawn: logs, rockfalls and rivers are equally likely.
      logWeight: 1, stoneWeight: 1, riverWeight: 1,
      drowningMs: 650,
      /**
       * Render-only multipliers on the Blender-authored log/stone meshes; collision still uses radius.
       * Width stays 1 because the meshes already span their lanes. Logs are authored up to ~1.25 tall and
       * rockfalls up to ~1.6 (tools/trail_stone_hazards.py), so both stay under ~1.85, below the 2.4 jump peak.
       */
      visualScale: {
        log: { height: 1.15, depth: 1.75 },
        stones: { height: 1.15, depth: 1 },
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
      /** Holding the shield inside a cloud earns a point this often (~1.7 a second). */
      shieldPointMs: 600,
      /** Trail hazards must be at least this far ahead of the spawn line. */
      spawnClearance: 25,
      /** HUD warning starts this far before the front edge reaches the player. */
      warnDistance: 45,
    },
    boss: { triggerKills: 15 },
    /**
     * Score rules; see core/scoring.ts. Points come from score orbs alone, so
     * the score counts what the player actually picked up. Kill values are small
     * on purpose -- roughly one orb, one point -- and scale with how long each
     * kind takes to bring down. The combo rewards keeping up the jog: every
     * `comboStep` kills inside the window raise the multiplier.
     */
    scoring: {
      kill: { weak: 1, normal: 2, tank: 4, boss: 20 },
      comboWindowMs: 2500,
      comboStep: 5,
      multiplierStep: 0.5,
      maxMultiplier: 3,
    },
    /**
     * Score orbs (core/orbs.ts). A kill's points drop as orbs where the enemy
     * fell and count once the player's magnet pulls them in: any lane, within
     * `magnetReach` ahead. A kill drops one orb per point, up to `perKill` orbs;
     * past that the points are shared out. `spacing` strings a kill's orbs out
     * along its lane. `maxOrbs` caps the field; past it, a kill's points are
     * banked directly.
     */
    scoreOrbs: {
      perKill: { weak: 3, normal: 4, tank: 6, boss: 14 },
      maxOrbs: 96,
      spacing: 1.4,
      magnetReach: 5,
    },
    /**
     * Heights are matched to the player (the mage stands ~3.7 with hat). approachSpeed is relative
     * to the scrolling ground and must stay positive: a negative value makes the enemy back away
     * while its Walk clip steps forward. walkRate is the Walk clip's playback speed, so the
     * faster kinds stride quicker instead of gliding.
     */
    enemyTypes: {
      weak: { name: 'Goblin Scout', path: '/assets/models/enemies/animated/GoblinScout.glb', hp: 1, approachSpeed: 3.5, walkRate: 1.6, height: 3.4, radius: 1, color: '#9bdd66', laneSpan: 1 },
      normal: { name: 'Bramble Skeleton', path: '/assets/models/enemies/animated/BrambleSkeleton.glb', hp: 2, approachSpeed: 2, walkRate: 1.25, height: 3.7, radius: 1.05, color: '#e5d7b1', laneSpan: 1 },
      tank: { name: 'Shroom Brute', path: '/assets/models/enemies/animated/ShroomBrute.glb', hp: 6, approachSpeed: 1, walkRate: 1, height: 3.9, radius: 1.3, color: '#e9a15b', laneSpan: 1 },
      boss: { name: 'Elder Treant', path: '/assets/models/enemies/animated/ElderTreant.glb', hp: 12, approachSpeed: 0.5, walkRate: 0.9, height: 8, radius: 2, color: '#df7650', laneSpan: 3 },
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
