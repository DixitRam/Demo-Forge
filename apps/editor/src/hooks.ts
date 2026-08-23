import { useEffect } from 'react';

export interface Hotkeys {
  [combo: string]: () => void;
}

/**
 * Global single-key shortcuts, ignored while a form control has focus so
 * typing a hex colour does not scrub the video.
 */
export function useHotkeys(map: Hotkeys): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement) {
        if (el.type !== 'range' && el.type !== 'checkbox') return;
      }
      if (el instanceof HTMLTextAreaElement) return;
      const combo = `${e.shiftKey ? 'shift+' : ''}${e.key.length === 1 ? e.key.toLowerCase() : e.key}`;
      const fn = map[combo];
      if (!fn) return;
      e.preventDefault();
      fn();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [map]);
}
