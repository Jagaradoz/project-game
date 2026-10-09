'use client';

/**
 * The click that getUserMedia is allowed to ride on.
 *
 * Browsers — iOS Safari in particular — will not show the native camera prompt,
 * or play the video element, unless startCamera() is called from a user
 * gesture. This dialog is that gesture: it cannot auto-fire on mount.
 */

import { Keyboard, Map, Video, VideoOff } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';

import { Button, LinkButton } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';
import { GraphicsSettings } from '@/components/game/GraphicsSettings';

interface CameraPermissionModalProps {
  error: string | null;
  status?: string | null;
  onAllow: () => void | Promise<void>;
  onSkip?: () => void;
  isCameraHidden?: boolean;
  onToggleCamera?: () => void;
}

type PermissionHint = 'prompt' | 'granted' | 'denied' | 'unknown';

export function CameraPermissionModal({ error, status, onAllow, onSkip, isCameraHidden = false, onToggleCamera }: CameraPermissionModalProps) {
  const router = useRouter();
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  const [isRequesting, setIsRequesting] = useState(false);
  const [permission, setPermission] = useState<PermissionHint>('unknown');

  useEffect(() => {
    let cancelled = false;
    let permissionStatus: PermissionStatus | null = null;

    if (!navigator.permissions?.query) return;

    void navigator.permissions
      .query({ name: 'camera' as PermissionName })
      .then((result) => {
        if (cancelled) return;
        permissionStatus = result;
        setPermission(result.state);
        result.onchange = () => {
          if (!cancelled) setPermission(result.state);
        };
      })
      .catch(() => {
        // Safari and some WebViews omit camera from the Permissions API.
      });

    return () => {
      cancelled = true;
      if (permissionStatus) permissionStatus.onchange = null;
    };
  }, []);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.querySelector<HTMLElement>('button, a[href]')?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        router.push('/');
        return;
      }

      if (event.key !== 'Tab' || !panelRef.current) return;

      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:checked',
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [router]);

  const allow = async () => {
    setIsRequesting(true);
    try {
      await onAllow();
    } finally {
      setIsRequesting(false);
    }
  };

  const copy = copyFor(permission, Boolean(error));

  return (
    <div
      id="cameraPermissionModal"
      className="fixed inset-0 z-40 grid place-items-center bg-[rgba(10,12,15,0.78)] p-4 backdrop-blur-[2px]"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        aria-busy={isRequesting || undefined}
        className="flex max-h-[calc(100dvh_-_2rem)] w-full max-w-md flex-col gap-4 overflow-y-auto border-2 border-ink bg-surface p-5 shadow-[7px_7px_0_0_var(--color-primary)] sm:p-6"
      >
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="mt-0.5 grid size-9 flex-none place-items-center rounded-none bg-primary-soft text-primary"
          >
            <Video size={20} />
          </span>
          <div className="flex min-w-0 flex-col gap-1.5">
            <span className="eyebrow">Camera</span>
            <h2 id={titleId} className="m-0 text-xl font-semibold tracking-tight sm:text-2xl">
              {copy.title}
            </h2>
          </div>
        </div>

        <p id={descriptionId} className="m-0 text-sm leading-relaxed text-muted">
          {copy.body}
        </p>

        <GraphicsSettings />

        {onToggleCamera && (
          <div className="flex flex-col gap-2">
            <Button
              variant={isCameraHidden ? 'navy' : 'secondary'}
              icon={<VideoOff size={18} />}
              aria-pressed={isCameraHidden}
              disabled={isRequesting}
              onClick={onToggleCamera}
            >
              Hide camera image
            </Button>
            <p className="m-0 text-xs leading-relaxed text-muted">
              {isCameraHidden ? 'Camera image hidden. ' : 'Enable to keep the camera area black. '}
              Movement detection stays active and detector lines stay visible.
            </p>
          </div>
        )}

        {error && (
          <Notice tone="error" title="Could not open the camera">
            {error}
          </Notice>
        )}

        {isRequesting && status && !error && (
          <p role="status" className="m-0 text-sm text-muted">
            {status}
          </p>
        )}

        <div className="flex flex-col gap-3 pt-1 sm:flex-row">
          <Button
            className="flex-1"
            icon={<Video size={18} />}
            isLoading={isRequesting}
            onClick={() => void allow()}
          >
            {isRequesting ? loadingLabel(status) : copy.cta}
          </Button>
          <LinkButton href="/characters" icon={<Map size={18} />} className="flex-1">
            Change magician
          </LinkButton>
        </div>
        {onSkip && (
          <Button variant="secondary" icon={<Keyboard size={18} />} onClick={onSkip}>
            Play without camera (dev)
          </Button>
        )}
      </div>
    </div>
  );
}

function loadingLabel(status: string | null | undefined): string {
  if (status && /pose model/i.test(status)) return 'Loading pose model…';
  if (status && /requesting camera/i.test(status)) return 'Waiting for browser…';
  return 'Starting camera…';
}

function copyFor(
  permission: PermissionHint,
  hasError: boolean,
): { title: string; body: string; cta: string } {
  if (permission === 'denied' || hasError) {
    return {
      title: 'Camera access is needed',
      body: "Allow the camera for this site in your browser's address bar, then try again. Video stays on this device and is never uploaded.",
      cta: 'Try again',
    };
  }

  if (permission === 'granted') {
    return {
      title: 'Turn on your camera',
      body: 'This game reads your movement through the webcam. Tap to start tracking — video stays on this device.',
      cta: 'Turn on camera',
    };
  }

  return {
    title: 'Allow camera access',
    body: 'This game reads your movement through the webcam. Your browser will ask for permission next. Video stays on this device and is never uploaded.',
    cta: 'Allow camera',
  };
}
