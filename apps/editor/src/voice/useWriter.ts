/**
 * Driving the script writer: grab the frames, ask, place the answer.
 *
 * The model returns words tied to step numbers; the timing, the ordering and
 * the spacing stay here. `spaceOutScript` at the end is not belt-and-braces —
 * a model writing to a word budget still lands the odd line long, and lines
 * talking over each other is the one flaw that makes a demo unusable.
 */

import {
  MIN_LINE_GAP_MS,
  scriptFromSteps,
  scriptSteps,
  type DemoRecording,
  type ScriptLine,
} from '@demoforge/core';
import { useCallback, useEffect, useState } from 'react';
import { spaceOutScript } from '../timeline/scriptOps.js';
import { captureFrames, requestScript, scriptStatus, type WriterStatus } from './writeScript.js';

export function useWriter() {
  const [status, setStatus] = useState<WriterStatus | null>(null);
  const [stage, setStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void scriptStatus().then(setStatus);
  }, []);

  const write = useCallback(
    async (
      video: HTMLVideoElement,
      rec: DemoRecording,
      brief: string,
      wpm: number,
    ): Promise<ScriptLine[] | null> => {
      setError(null);
      try {
        const steps = scriptSteps(rec, wpm);
        setStage('Reading the screen…');
        const frames = await captureFrames(video, steps, (done, total) =>
          setStage(`Reading the screen ${done}/${total}…`),
        );

        setStage('Writing…');
        const written = await requestScript(steps, frames, brief);
        if (written.length === 0) throw new Error('The writer had nothing to say about this.');

        return spaceOutScript(scriptFromSteps(steps, written), wpm, MIN_LINE_GAP_MS);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'The writer failed.');
        return null;
      } finally {
        setStage(null);
      }
    },
    [],
  );

  return { status, stage, error, write };
}
