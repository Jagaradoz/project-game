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
     * MediaPipe x is in raw (un-mirrored) camera space, so the subject moving to
     * their OWN left increases x. Flip this if the on-screen label reads backwards.
     */
    invertSides: false,
  },

  jog: {
    /** |kneeDelta| (in torso-lengths) needed to flip the up-knee state machine. */
    crossThreshold: 0.15,
    /** A state must also peak above this before its transition counts as a step. */
    peakThreshold: 0.2,
    /** EMA weight for kneeDelta. */
    smoothing: 0.45,
    /** Steps are counted within this trailing window. */
    windowMs: 2000,
    /** Minimum steps inside the window to call it jogging. */
    minStepsInWindow: 3,
    /** Drop back to not-jogging after this long with no step. */
    timeoutMs: 1200,
    /** Plausible human cadence band, in steps per minute. */
    minCadenceSpm: 60,
    maxCadenceSpm: 240,
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
};
