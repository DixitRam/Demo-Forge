import { cutDuration, normalizeCuts } from '@demoforge/core';
import { useEffect, useMemo, useState } from 'react';
import ExportDialog from './export/ExportDialog.js';
import { useHotkeys } from './hooks.js';
import DropZone from './import/DropZone.js';
import Sidebar from './panels/Sidebar.js';
import CutInspector from './panels/CutInspector.js';
import ZoomInspector from './panels/ZoomInspector.js';
import FocusOverlay from './player/FocusOverlay.js';
import Player from './player/Player.js';
import Transport from './player/Transport.js';
import { useProject } from './state/useProject.js';
import { setTarget } from './timeline/kfOps.js';
import Timeline, { type Selection } from './timeline/Timeline.js';
import NarrationTrack from './voice/NarrationTrack.js';
import { useVoice } from './voice/useVoice.js';
import { useWriter } from './voice/useWriter.js';

const FRAME_MS = 1000 / 30;

export default function App() {
  const {
    project,
    keyframes,
    setKeyframes,
    captions,
    setCaptions,
    cuts,
    setCuts,
    script,
    setScript,
    brief,
    setBrief,
    style,
    setStyle,
    load,
    replan,
    save,
  } = useProject();
  const [timeMs, setTimeMs] = useState(0);
  const [selection, setSelection] = useState<Selection>(null);
  const [zoomEnabled, setZoomEnabled] = useState(true);
  // Bumped by the Z / C shortcuts; the timeline decides where the new item goes.
  const [addZoom, setAddZoom] = useState(0);
  const [addCaption, setAddCaption] = useState(0);
  const [addCut, setAddCut] = useState(0);
  const [addLine, setAddLine] = useState(0);

  const active = useMemo(() => (zoomEnabled ? keyframes : []), [zoomEnabled, keyframes]);

  const video = project?.video;
  const duration = project?.rec.video.durationMs ?? 0;
  const voice = useVoice(duration);
  const writer = useWriter();

  // A narration saved with the project plays straight away, and its lines go
  // back into the speech cache so editing one does not respeak them all.
  const { adopt } = voice;
  useEffect(() => {
    if (project?.narration) {
      void adopt(project.narration, project.script, project.style.voice);
    }
  }, [project, adopt]);

  const seek = (ms: number): void => {
    if (video) video.currentTime = Math.min(Math.max(0, ms), duration) / 1000;
  };

  const deleteSelected = (): void => {
    if (!selection) return;
    if (selection.kind === 'zoom')
      setKeyframes(keyframes.filter((_, i) => i !== selection.index));
    else if (selection.kind === 'caption')
      setCaptions(captions.filter((_, i) => i !== selection.index));
    else if (selection.kind === 'script')
      setScript(script.filter((_, i) => i !== selection.index));
    else setCuts(cuts.filter((_, i) => i !== selection.index));
    setSelection(null);
  };

  useHotkeys(
    useMemo(
      () => ({
        ' ': () => {
          if (!video) return;
          video.paused ? void video.play() : video.pause();
        },
        z: () => setAddZoom((n) => n + 1),
        t: () => setAddCut((n) => n + 1),
        // Cut everything before / after the playhead — the head-and-tail trim.
        i: () => setCuts(normalizeCuts([...cuts, { tStart: 0, tEnd: timeMs }], duration)),
        o: () => setCuts(normalizeCuts([...cuts, { tStart: timeMs, tEnd: duration }], duration)),
        c: () => setAddCaption((n) => n + 1),
        n: () => setAddLine((n) => n + 1),
        s: () => save(voice.narration),
        ArrowLeft: () => seek(timeMs - FRAME_MS),
        ArrowRight: () => seek(timeMs + FRAME_MS),
        'shift+ArrowLeft': () => seek(timeMs - 1000),
        'shift+ArrowRight': () => seek(timeMs + 1000),
        Home: () => seek(0),
        End: () => seek(duration),
        Escape: () => setSelection(null),
        Delete: deleteSelected,
        Backspace: deleteSelected,
      }),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [video, timeMs, duration, selection, keyframes, captions, cuts, script, save, voice.narration],
    ),
  );

  if (!project) return <DropZone onLoad={load} />;

  const videoAspect = project.video.videoWidth / (project.video.videoHeight || 1);
  const aimIndex =
    selection?.kind === 'zoom' && selection.index < keyframes.length ? selection.index : null;
  // While aiming a zoom the preview shows the unzoomed frame, so the focus
  // rectangle means "this is what will be visible" rather than sitting on top
  // of an already-zoomed picture.
  const preview = aimIndex === null ? active : [];

  return (
    <div className="flex h-full flex-col bg-slate-950">
      <header className="flex items-center gap-3 border-b border-slate-800 px-4 py-2">
        <h1 className="text-sm font-semibold">DemoForge</h1>
        <span className="text-xs text-slate-500">
          {project.rec.events.length} events · {keyframes.length} zooms · {captions.length}{' '}
          captions
          {cuts.length > 0 && (
            <>
              {' '}
              · <span className="text-red-300/80">{(cutDuration(cuts) / 1000).toFixed(1)}s cut</span>
            </>
          )}
        </span>
        {project.warning && (
          <span className="truncate text-xs text-amber-400">{project.warning}</span>
        )}
        <button
          onClick={() => save(voice.narration)}
          title="Save project (S) — JSON you can edit by hand or with a script, plus the narration"
          className="ml-auto rounded bg-slate-800 px-3 py-1 text-xs text-slate-200 hover:bg-slate-700"
        >
          Save project
        </button>
        <ExportDialog
          project={project}
          keyframes={active}
          captions={captions}
          cuts={cuts}
          style={style}
          narration={voice.narration}
        />
      </header>

      <div className="flex min-h-0 flex-1">
        <main className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-[radial-gradient(ellipse_at_top,theme(colors.slate.900),theme(colors.slate.950))] p-6">
          <Player
            project={project}
            keyframes={preview}
            captions={captions}
            cuts={cuts}
            style={style}
            onTime={setTimeMs}
            overlay={
              aimIndex === null
                ? undefined
                : ({ w, h }) => (
                    <FocusOverlay
                      kf={keyframes[aimIndex]!}
                      canvasW={w}
                      canvasH={h}
                      videoW={project.video.videoWidth}
                      videoH={project.video.videoHeight}
                      viewport={project.rec.viewport}
                      style={style}
                      onPlace={(x, y) => setKeyframes(setTarget(keyframes, aimIndex, x, y))}
                    />
                  )
            }
          />
          {selection?.kind === 'cut' && selection.index < cuts.length && (
            <CutInspector
              cuts={cuts}
              index={selection.index}
              onClose={() => setSelection(null)}
              onDelete={deleteSelected}
            />
          )}
          {aimIndex !== null && (
            <ZoomInspector
              rec={project.rec}
              keyframes={keyframes}
              setKeyframes={setKeyframes}
              index={aimIndex}
              onClose={() => setSelection(null)}
              onDelete={deleteSelected}
            />
          )}
        </main>
        <NarrationTrack
          video={project.video}
          url={voice.narrationUrl}
          gain={style.voice.gain}
        />
        <Sidebar
          rec={project.rec}
          style={style}
          setStyle={setStyle}
          keyframes={keyframes}
          setKeyframes={setKeyframes}
          captions={captions}
          setCaptions={setCaptions}
          script={script}
          setScript={setScript}
          brief={brief}
          setBrief={setBrief}
          writer={writer.status}
          writing={writer.stage}
          writeError={writer.error}
          onWrite={() => {
            void writer.write(project.video, project.rec, brief, style.voice.rate).then((lines) => {
              if (!lines) return;
              setScript(lines);
              setSelection(null);
            });
          }}
          onSeek={seek}
          voiceProviders={voice.providers}
          voiceProgress={voice.progress}
          voiceError={voice.error}
          hasNarration={voice.narration !== null}
          onGenerateVoice={() => void voice.generate(script, style.voice).then(setScript)}
          selection={selection}
          onSelect={setSelection}
          timeMs={timeMs}
          zoomEnabled={zoomEnabled}
          setZoomEnabled={setZoomEnabled}
          onReplan={() => {
            replan();
            setSelection(null);
          }}
          videoAspect={videoAspect}
        />
      </div>

      <footer className="border-t border-slate-800 bg-slate-950">
        <Transport
          video={project.video}
          timeMs={timeMs}
          durationMs={duration}
          style={style}
          setStyle={setStyle}
        />
        <Timeline
          rec={project.rec}
          keyframes={keyframes}
          setKeyframes={setKeyframes}
          captions={captions}
          setCaptions={setCaptions}
          cuts={cuts}
          setCuts={setCuts}
          script={script}
          setScript={setScript}
          wpm={style.voice.rate}
          timeMs={timeMs}
          onSeek={seek}
          selection={selection}
          onSelect={setSelection}
          mediaName={project.mediaName}
          addZoomSignal={addZoom}
          addCaptionSignal={addCaption}
          addCutSignal={addCut}
          addLineSignal={addLine}
        />
      </footer>
    </div>
  );
}
