export type {
  DemoElement,
  DemoEvent,
  DemoRecording,
  DemoSource,
  DemoViewport,
} from './types.js';

export { DEFAULT_ZOOM_CONFIG, clampTarget, planZooms } from './zoom-planner.js';
export type { ZoomConfig, ZoomKeyframe } from './zoom-planner.js';

export { IDLE_ZOOM, evaluateZoom } from './zoom-eval.js';
export type { ZoomState } from './zoom-eval.js';

export { DEFAULT_CURSOR_CONFIG, cursorAt, cursorWaypoints } from './cursor.js';
export type { CursorConfig, CursorState } from './cursor.js';

export { DRIFT_TOLERANCE_MS, reconcileTimebase } from './timebase.js';
export type { ReconcileResult } from './timebase.js';

export { clamp01, ease, lerp } from './easing.js';
export type { Easing } from './easing.js';
