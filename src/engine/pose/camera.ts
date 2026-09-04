/** Webcam acquisition. Everything mobile-specific about the camera lives here. */

import { CONFIG } from '@/engine/config';
import type { CameraConfig } from '@/engine/types';

export interface CameraStartResult {
  stream: MediaStream;
  width: number;
  height: number;
  label: string;
  frameRate: number | null;
}

/**
 * Requests the front camera and resolves once the video element has real
 * dimensions and is playing.
 *
 * Must be called from a user gesture: iOS Safari gates both the permission
 * prompt and `video.play()` behind one.
 */
export async function startCamera(
  video: HTMLVideoElement,
  config: CameraConfig = CONFIG.camera,
): Promise<CameraStartResult> {
  assertSecureContext();

  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('This browser does not expose navigator.mediaDevices.getUserMedia.');
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: config.facingMode,
      width: { ideal: config.idealWidth },
      height: { ideal: config.idealHeight },
    },
  });

  // Without these three, iOS Safari refuses to play inline and renders a black
  // frame. This is by far the most common mobile failure mode.
  video.playsInline = true;
  video.muted = true;
  video.autoplay = true;

  video.srcObject = stream;
  await waitForMetadata(video);
  await video.play();

  const [track] = stream.getVideoTracks();
  const settings = track?.getSettings() ?? {};

  return {
    stream,
    width: video.videoWidth,
    height: video.videoHeight,
    label: track?.label ?? 'unknown camera',
    frameRate: settings.frameRate ?? null,
  };
}

export function stopCamera(stream: MediaStream | null | undefined): void {
  stream?.getTracks().forEach((track) => track.stop());
}

/**
 * getUserMedia is unavailable outside a secure context. Catching it here gives a
 * real message instead of a bare NotAllowedError -- the usual cause is opening
 * the page over http:// on a LAN IP from a phone.
 */
function assertSecureContext() {
  if (window.isSecureContext) return;
  throw new Error(
    'Camera access requires HTTPS (or localhost). ' +
      `This page was loaded over ${window.location.protocol}//${window.location.host} -- use the ngrok https:// URL instead.`,
  );
}

function waitForMetadata(video: HTMLVideoElement): Promise<void> {
  if (video.readyState >= HTMLMediaElement.HAVE_METADATA) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    video.addEventListener('loadedmetadata', () => resolve(), { once: true });
    video.addEventListener('error', () => reject(new Error('Video element failed to load the camera stream.')), {
      once: true,
    });
  });
}

/** Turns raw getUserMedia rejections into something readable on a phone screen. */
export function describeCameraError(error: unknown): string {
  switch (error instanceof Error ? error.name : undefined) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Camera permission denied. Allow camera access for this site, then reload.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'No camera matched the request. Check that a front-facing camera is available.';
    case 'NotReadableError':
      return 'The camera is already in use by another app or tab. Close it and reload.';
    default:
      return error instanceof Error ? error.message : String(error);
  }
}
