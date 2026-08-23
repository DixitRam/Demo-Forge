import { planZooms, type ZoomKeyframe } from '@demoforge/core';
import { useCallback, useState } from 'react';
import type { LoadedProject } from '../import/loadRecording.js';
import { DEFAULT_STYLE, type FrameStyle } from '../render/style.js';

export function useProject() {
  const [project, setProject] = useState<LoadedProject | null>(null);
  const [keyframes, setKeyframes] = useState<ZoomKeyframe[]>([]);
  const [style, setStyle] = useState<FrameStyle>(DEFAULT_STYLE);

  const load = useCallback((p: LoadedProject) => {
    setProject(p);
    setKeyframes(planZooms(p.rec));
  }, []);

  // The planner output is a starting point; the timeline owns it after that.
  const replan = useCallback(() => {
    if (project) setKeyframes(planZooms(project.rec));
  }, [project]);

  return { project, keyframes, setKeyframes, style, setStyle, load, replan };
}
