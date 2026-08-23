import { useMemo, useState } from 'react';
import ExportDialog from './export/ExportDialog.js';
import DropZone from './import/DropZone.js';
import StylePanel from './panels/StylePanel.js';
import ZoomPanel from './panels/ZoomPanel.js';
import Player from './player/Player.js';
import Transport from './player/Transport.js';
import { useProject } from './state/useProject.js';
import Timeline from './timeline/Timeline.js';

export default function App() {
  const { project, keyframes, setKeyframes, style, setStyle, load, replan } = useProject();
  const [timeMs, setTimeMs] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [zoomEnabled, setZoomEnabled] = useState(true);

  const active = useMemo(() => (zoomEnabled ? keyframes : []), [zoomEnabled, keyframes]);

  if (!project) return <DropZone onLoad={load} />;

  const seek = (ms: number): void => {
    project.video.currentTime = Math.max(0, ms) / 1000;
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-baseline gap-3 border-b border-slate-800 px-4 py-2">
        <h1 className="text-sm font-semibold">DemoForge</h1>
        <span className="text-xs text-slate-500">
          {project.rec.events.length} events · {keyframes.length} zooms
        </span>
        {project.warning && <span className="text-xs text-amber-400">{project.warning}</span>}
        <ExportDialog project={project} keyframes={active} style={style} />
      </header>

      <div className="flex min-h-0 flex-1">
        <main className="flex min-h-0 flex-1 items-center justify-center bg-slate-900/40 p-6">
          <Player project={project} keyframes={active} style={style} onTime={setTimeMs} />
        </main>
        <aside className="flex w-64 shrink-0 flex-col overflow-y-auto border-l border-slate-800">
          <ZoomPanel
            keyframes={keyframes}
            setKeyframes={setKeyframes}
            selected={selected}
            enabled={zoomEnabled}
            setEnabled={setZoomEnabled}
            onReplan={() => {
              replan();
              setSelected(null);
            }}
          />
          <StylePanel style={style} setStyle={setStyle} />
        </aside>
      </div>

      <footer className="border-t border-slate-800">
        <Timeline
          rec={project.rec}
          keyframes={keyframes}
          setKeyframes={setKeyframes}
          timeMs={timeMs}
          onSeek={seek}
          selected={selected}
          onSelect={setSelected}
        />
        <Transport
          video={project.video}
          timeMs={timeMs}
          durationMs={project.rec.video.durationMs}
        />
      </footer>
    </div>
  );
}
