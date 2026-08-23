export type {
  DemoElement,
  DemoEvent,
  DemoRecording,
  DemoSource,
  DemoViewport,
} from './types.js';

export { DEFAULT_ZOOM_CONFIG, clampTarget, planZooms, zoomAnchor } from './zoom-planner.js';
export type { ZoomConfig, ZoomKeyframe } from './zoom-planner.js';

export { IDLE_ZOOM, evaluateZoom } from './zoom-eval.js';
export type { ZoomState } from './zoom-eval.js';

export { DEFAULT_CURSOR_CONFIG, cursorAt, cursorWaypoints } from './cursor.js';
export type { CursorConfig, CursorState } from './cursor.js';

export { DRIFT_TOLERANCE_MS, reconcileTimebase } from './timebase.js';
export type { ReconcileResult } from './timebase.js';

export { clamp01, ease, lerp } from './easing.js';
export type { Easing } from './easing.js';

export {
  DEFAULT_STYLE,
  PROJECT_FORMAT,
  PROJECT_VERSION,
  createProject,
  isProject,
  parseProject,
} from './project.js';

export {
  MIN_CUT_MS,
  cutAt,
  cutDuration,
  editedDuration,
  editedToSource,
  keptSegments,
  normalizeCuts,
  skipTarget,
  sourceToEdited,
} from './edits.js';
export type { CutRegion, Segment } from './edits.js';
export {
  DEFAULT_DRAFT,
  DEFAULT_VOICE,
  MIN_LINE_GAP_MS,
  estimateSpeechMs,
  lineDuration,
  scriptDuration,
  scriptFromClicks,
  scriptOverruns,
  scriptSlotAt,
  sortScript,
} from './script.js';
export type { ScriptDraftConfig, ScriptLine, VoiceStyle } from './script.js';

export type {
  CaptionCue,
  CaptionStyle,
  CursorStyle,
  DemoProject,
  ProjectParts,
  ProjectBackground,
  ProjectStyle,
} from './project.js';
