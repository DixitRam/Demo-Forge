import {
  createProject,
  planZooms,
  type CaptionCue,
  type ProjectStyle,
  type CutRegion,
  type ScriptLine,
  type ZoomKeyframe,
} from '@demoforge/core';
import { useCallback, useState } from 'react';
import type { LoadedProject } from '../import/loadRecording.js';
import { DEFAULT_STYLE } from '../render/style.js';

export function useProject() {
  const [project, setProject] = useState<LoadedProject | null>(null);
  const [keyframes, setKeyframes] = useState<ZoomKeyframe[]>([]);
  const [captions, setCaptions] = useState<CaptionCue[]>([]);
  const [cuts, setCuts] = useState<CutRegion[]>([]);
  const [script, setScript] = useState<ScriptLine[]>([]);
  const [style, setStyle] = useState<ProjectStyle>(DEFAULT_STYLE);

  const load = useCallback((p: LoadedProject) => {
    setProject(p);
    setKeyframes(p.zooms);
    setCaptions(p.captions);
    setCuts(p.cuts);
    setScript(p.script);
    setStyle(p.style);
  }, []);

  // The planner output is a starting point; the timeline owns it after that.
  const replan = useCallback(() => {
    if (project) setKeyframes(planZooms(project.rec));
  }, [project]);

  /**
   * Save everything but the video as one readable JSON file. It is the same
   * schema a script or an agent can edit and hand back.
   */
  const save = useCallback(() => {
    if (!project) return;
    const doc = createProject(project.rec, project.mediaName, {
      zooms: keyframes,
      captions,
      cuts,
      script,
      style,
    });
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.mediaName.replace(/\.[^.]+$/, '') || 'demo'}.dfp.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [project, keyframes, captions, cuts, script, style]);

  return {
    project,
    keyframes,
    setKeyframes,
    captions,
    setCaptions,
    cuts,
    setCuts,
    script,
    setScript,
    style,
    setStyle,
    load,
    replan,
    save,
  };
}
