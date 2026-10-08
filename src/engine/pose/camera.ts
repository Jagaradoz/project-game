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
  signal?: AbortSignal,
): Promise<CameraStartResult> {
  throwIfAborted(signal);
  assertSecureContext();

  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('This browser does not expose navigator.mediaDevices.getUserMedia.');
  }

  const stream = await withAbort(navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: config.facingMode,
      width: { ideal: config.idealWidth },
      height: { ideal: config.idealHeight },
    },
  }), signal, stopCamera);

  try {
    throwIfAborted(signal);
    // Without these three, iOS Safari refuses to play inline and renders a black
    // frame. This is by far the most common mobile failure mode.
    video.playsInline = true;
    video.muted = true;
    video.autoplay = true;

    video.srcObject = stream;
    await waitForMetadata(video, signal);
    await withAbort(video.play(), signal);

    const [track] = stream.getVideoTracks();
    const settings = track?.getSettings() ?? {};

    return {
      stream,
      width: video.videoWidth,
      height: video.videoHeight,
      label: track?.label ?? 'unknown camera',
      frameRate: settings.frameRate ?? null,
    };
  } catch (error) {
    stopCamera(stream);
    if (video.srcObject === stream) {
      video.pause();
      video.srcObject = null;
    }
    throw error;
  }
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

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Camera startup cancelled.', 'AbortError');
}

/** Browser permission prompts cannot be aborted; release a stream arriving late. */
function withAbort<T>(pending: Promise<T>, signal?: AbortSignal, onLateResult?: (result: T) => void): Promise<T> {
  if (!signal) return pending;
  return new Promise<T>((resolve, reject) => {
    const abort = () => {
      signal.removeEventListener('abort', abort);
      reject(new DOMException('Camera startup cancelled.', 'AbortError'));
    };
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    pending.then((result) => {
      signal.removeEventListener('abort', abort);
      if (signal.aborted) {
        onLateResult?.(result);
        abort();
      } else {
        resolve(result);
      }
    }, (error) => {
      signal.removeEventListener('abort', abort);
      reject(error);
    });
  });
}

function waitForMetadata(video: HTMLVideoElement, signal?: AbortSignal): Promise<void> {
  throwIfAborted(signal);
  if (video.readyState >= HTMLMediaElement.HAVE_METADATA) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener('loadedmetadata', loaded);
      video.removeEventListener('error', failed);
      signal?.removeEventListener('abort', aborted);
    };
    const loaded = () => { cleanup(); resolve(); };
    const failed = () => { cleanup(); reject(new Error('Video element failed to load the camera stream.')); };
    const aborted = () => { cleanup(); reject(new DOMException('Camera startup cancelled.', 'AbortError')); };
    video.addEventListener('loadedmetadata', loaded, { once: true });
    video.addEventListener('error', failed, { once: true });
    signal?.addEventListener('abort', aborted, { once: true });
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
