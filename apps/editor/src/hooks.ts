import { useEffect } from 'react';

export interface Hotkeys {
  [combo: string]: () => void;
}

/**
 * Global single-key shortcuts.
 *
 * Any focused form control keeps its own keys: typing a caption must not add
 * a zoom, Space on a checkbox must toggle it, and arrows on a slider must move
 * the slider rather than scrub the video. Buttons are deliberately not
 * excluded — Space still plays after you click one.
 */
export function useHotkeys(map: Hotkeys): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const el = document.activeElement;
      if (
        el instanceof HTMLInputElement ||
        el instanceof HTMLSelectElement ||
        el instanceof HTMLTextAreaElement ||
        (el instanceof HTMLElement && el.isContentEditable)
      ) {
        return;
      }
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
