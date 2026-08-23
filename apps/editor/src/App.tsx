import { useMemo, useState } from 'react';
import ExportDialog from './export/ExportDialog.js';
import { useHotkeys } from './hooks.js';
import DropZone from './import/DropZone.js';
import Sidebar from './panels/Sidebar.js';
import ZoomInspector from './panels/ZoomInspector.js';
import FocusOverlay from './player/FocusOverlay.js';
import Player from './player/Player.js';
import Transport from './player/Transport.js';
import { useProject } from './state/useProject.js';
import { setTarget } from './timeline/kfOps.js';
import Timeline from './timeline/Timeline.js';

const FRAME_MS = 1000 / 30;

export default function App() {
  const { project, keyframes, setKeyframes, style, setStyle, load, replan } = useProject();
  const [timeMs, setTimeMs] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [zoomEnabled, setZoomEnabled] = useState(true);
  // Bumped by the Z shortcut; the timeline owns where a new zoom actually goes.
  const [addSignal, setAddSignal] = useState(0);

  const active = useMemo(() => (zoomEnabled ? keyframes : []), [zoomEnabled, keyframes]);
  // While aiming a zoom the preview shows the unzoomed frame, so the focus
  // rectangle means "this is what will be visible" rather than sitting on top
  // of an already-zoomed picture.
  const aiming = selected !== null && selected < keyframes.length;
  const preview = aiming ? [] : active;

  const video = project?.video;
  const duration = project?.rec.video.durationMs ?? 0;
  const seek = (ms: number): void => {
    if (video) video.currentTime = Math.min(Math.max(0, ms), duration) / 1000;
  };

  useHotkeys(
    useMemo(
      () => ({
        ' ': () => {
          if (!video) return;
          video.paused ? void video.play() : video.pause();
        },
        z: () => setAddSignal((n) => n + 1),
        ArrowLeft: () => seek(timeMs - FRAME_MS),
        ArrowRight: () => seek(timeMs + FRAME_MS),
        'shift+ArrowLeft': () => seek(timeMs - 1000),
        'shift+ArrowRight': () => seek(timeMs + 1000),
        Home: () => seek(0),
        End: () => seek(duration),
        Delete: () => {
          if (selected === null) return;
          setKeyframes(keyframes.filter((_, i) => i !== selected));
          setSelected(null);
        },
        Backspace: () => {
          if (selected === null) return;
          setKeyframes(keyframes.filter((_, i) => i !== selected));
          setSelected(null);
        },
      }),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [video, timeMs, duration, selected, keyframes],
    ),
  );

  if (!project) return <DropZone onLoad={load} />;

  const videoAspect = project.video.videoWidth / (project.video.videoHeight || 1);

  return (
    <div className="flex h-full flex-col bg-slate-950">
      <header className="flex items-center gap-3 border-b border-slate-800 px-4 py-2">
        <h1 className="text-sm font-semibold">DemoForge</h1>
        <span className="text-xs text-slate-500">
          {project.rec.events.length} events · {keyframes.length} zooms ·{' '}
          {project.video.videoWidth}×{project.video.videoHeight}
        </span>
        {project.warning && (
          <span className="truncate text-xs text-amber-400">{project.warning}</span>
        )}
        <ExportDialog project={project} keyframes={active} style={style} />
      </header>

      <div className="flex min-h-0 flex-1">
        <main className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-[radial-gradient(ellipse_at_top,theme(colors.slate.900),theme(colors.slate.950))] p-6">
          <Player
            project={project}
            keyframes={preview}
            style={style}
            onTime={setTimeMs}
            overlay={
              aiming
                ? ({ w, h }) => (
                    <FocusOverlay
                      kf={keyframes[selected]!}
                      canvasW={w}
                      canvasH={h}
                      videoW={project.video.videoWidth}
                      videoH={project.video.videoHeight}
                      style={style}
                      onPlace={(x, y) => setKeyframes(setTarget(keyframes, selected, x, y))}
                    />
                  )
                : undefined
            }
          />
          {aiming && (
            <ZoomInspector
              rec={project.rec}
              keyframes={keyframes}
              setKeyframes={setKeyframes}
              index={selected}
              onClose={() => setSelected(null)}
              onDelete={() => {
                setKeyframes(keyframes.filter((_, i) => i !== selected));
                setSelected(null);
              }}
            />
          )}
        </main>
        <Sidebar
          rec={project.rec}
          style={style}
          setStyle={setStyle}
          keyframes={keyframes}
          setKeyframes={setKeyframes}
          selected={selected}
          zoomEnabled={zoomEnabled}
          setZoomEnabled={setZoomEnabled}
          onReplan={() => {
            replan();
            setSelected(null);
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
          timeMs={timeMs}
          onSeek={seek}
          selected={selected}
          onSelect={setSelected}
          mediaName={project.mediaName}
          addSignal={addSignal}
        />
      </footer>
    </div>
  );
}
