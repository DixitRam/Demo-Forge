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
   * Save everything but the video as one readable JSON file — zooms, captions,
   * cuts, the narration script and the style. It is the same schema a script
   * or an agent can edit and hand back.
   *
   * The rendered narration comes out beside it as a second file rather than
   * base64 inside the first: the project stays readable, and a hosted voice
   * is metered, so the audio is worth keeping rather than paying to speak
   * again on every load.
   */
  const save = useCallback(
    (narration: Blob | null) => {
      if (!project) return;
      const stem = project.mediaName.replace(/\.[^.]+$/, '') || 'demo';
      const narrationName = narration ? `${stem}.narration.wav` : '';

      const doc = createProject(project.rec, project.mediaName, {
        zooms: keyframes,
        captions,
        cuts,
        script,
        narrationName,
        style,
      });

      const download = (blob: Blob, name: string): void => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        a.click();
        URL.revokeObjectURL(url);
      };

      download(
        new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' }),
        `${stem}.dfp.json`,
      );
      if (narration) download(narration, narrationName);
    },
    [project, keyframes, captions, cuts, script, style],
  );

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
