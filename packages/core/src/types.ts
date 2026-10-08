/**
 * The central contract. Everything flows through DemoRecording.
 *
 * Defined ONCE here; imported by the extension, the editor, and (Phase 3)
 * the Playwright capture. See docs/design/02_ARCHITECTURE.md.
 *
 * THE RULE: no code downstream of DemoRecording may read `source` to change
 * behaviour. If you feel tempted to write `if (rec.source === ...)`, stop —
 * that is the seam that breaks Phase 3 reuse.
 */

export type DemoSource = 'extension' | 'playwright';

export interface DemoElement {
  tag: string; // 'button', 'a', 'input', ...
  text?: string; // visible text, trimmed, <= 60 chars
  rect: { x: number; y: number; w: number; h: number }; // CSS px, from getBoundingClientRect
}

export interface DemoEvent {
  t: number; // ms since recording start (t0 = MediaRecorder.start())
  type: 'click' | 'input' | 'scroll' | 'nav' | 'move'; // move: cursor-only waypoint (hover, attention circle)
  xNorm: number; // 0..1  (clientX / innerWidth)
  yNorm: number; // 0..1  (clientY / innerHeight)
  el?: DemoElement;
}

export interface DemoViewport {
  w: number; // innerWidth at capture
  h: number; // innerHeight at capture
  dpr: number; // devicePixelRatio
}

export interface DemoRecording {
  source: DemoSource; // downstream code MUST NOT branch on this
  createdAt: string; // ISO
  video: { durationMs: number; width: number; height: number; mime: string };
  viewport: DemoViewport;
  audioTrack?: boolean; // was mic/system audio captured
  events: DemoEvent[]; // time-ordered
}
