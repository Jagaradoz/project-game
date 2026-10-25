'use client';
import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import styles from './GuideMode.module.css';

/** Native modal dialogs keep background controls inert and restore opener focus. */
export function GuideOverlay({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      dialog?.close();
      if (opener?.isConnected) opener.focus();
    };
  }, []);
  return <dialog ref={ref} className={styles.overlay} aria-labelledby={titleId} onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) { const r = event.currentTarget.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) onClose(); } }}>
    <div className={styles.overlayHeader}><h2 id={titleId}>{title}</h2><button type="button" className={styles.close} onClick={onClose} aria-label="Close overlay" autoFocus><X size={20} aria-hidden /></button></div>
    <div className={styles.overlayBody}>{children}</div>
  </dialog>;
}
