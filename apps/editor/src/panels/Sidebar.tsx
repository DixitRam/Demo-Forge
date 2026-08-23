import { useState, type ReactNode } from 'react';
import type { CaptionCue, DemoRecording, ZoomKeyframe } from '@demoforge/core';
import type { FrameStyle } from '../render/style.js';
import type { Selection } from '../timeline/Timeline.js';
import BackgroundPanel from './BackgroundPanel.js';
import CaptionsPanel from './CaptionsPanel.js';
import CursorPanel from './CursorPanel.js';
import EffectsPanel from './EffectsPanel.js';
import LayoutPanel from './LayoutPanel.js';
import ZoomPanel from './ZoomPanel.js';
import { IconCaption, IconCursor, IconImage, IconLayout, IconSliders, IconZoom } from './icons.js';

type PanelId = 'background' | 'zoom' | 'captions' | 'effects' | 'layout' | 'cursor';

const TABS: Array<{ id: PanelId; title: string; icon: ReactNode }> = [
  { id: 'background', title: 'Background', icon: <IconImage /> },
  { id: 'zoom', title: 'Zoom', icon: <IconZoom /> },
  { id: 'captions', title: 'Captions', icon: <IconCaption /> },
  { id: 'effects', title: 'Effects', icon: <IconSliders /> },
  { id: 'layout', title: 'Layout', icon: <IconLayout /> },
  { id: 'cursor', title: 'Cursor', icon: <IconCursor /> },
];

interface Props {
  rec: DemoRecording;
  style: FrameStyle;
  setStyle: (s: FrameStyle) => void;
  keyframes: ZoomKeyframe[];
  setKeyframes: (kfs: ZoomKeyframe[]) => void;
  captions: CaptionCue[];
  setCaptions: (c: CaptionCue[]) => void;
  selection: Selection;
  onSelect: (s: Selection) => void;
  timeMs: number;
  zoomEnabled: boolean;
  setZoomEnabled: (v: boolean) => void;
  onReplan: () => void;
  videoAspect: number;
}

export default function Sidebar(p: Props) {
  const [open, setOpen] = useState<PanelId | null>('background');
  const active = TABS.find((t) => t.id === open);
  const selZoom = p.selection?.kind === 'zoom' ? p.selection.index : null;
  const selCaption = p.selection?.kind === 'caption' ? p.selection.index : null;

  return (
    <div className="flex min-h-0">
      {active && (
        <aside className="flex w-72 shrink-0 flex-col overflow-y-auto border-l border-slate-800 bg-slate-950/60 text-xs">
          <header className="sticky top-0 flex items-center justify-between border-b border-slate-800 bg-slate-950/90 px-4 py-3 backdrop-blur">
            <h2 className="text-sm font-semibold text-slate-100">{active.title}</h2>
            <button
              onClick={() => setOpen(null)}
              title="Collapse panel"
              className="rounded px-1.5 text-slate-500 hover:bg-slate-800 hover:text-slate-200"
            >
              ›
            </button>
          </header>
          <div className="p-4">
            {open === 'background' && <BackgroundPanel style={p.style} setStyle={p.setStyle} />}
            {open === 'effects' && <EffectsPanel style={p.style} setStyle={p.setStyle} />}
            {open === 'layout' && (
              <LayoutPanel style={p.style} setStyle={p.setStyle} videoAspect={p.videoAspect} />
            )}
            {open === 'cursor' && <CursorPanel style={p.style} setStyle={p.setStyle} />}
            {open === 'zoom' && (
              <ZoomPanel
                keyframes={p.keyframes}
                setKeyframes={p.setKeyframes}
                selected={selZoom}
                enabled={p.zoomEnabled}
                setEnabled={p.setZoomEnabled}
                onReplan={p.onReplan}
              />
            )}
            {open === 'captions' && (
              <CaptionsPanel
                rec={p.rec}
                captions={p.captions}
                setCaptions={p.setCaptions}
                selected={selCaption}
                onSelect={(i) => p.onSelect(i === null ? null : { kind: 'caption', index: i })}
                timeMs={p.timeMs}
                style={p.style}
                setStyle={p.setStyle}
              />
            )}
          </div>
        </aside>
      )}

      <nav className="flex w-12 shrink-0 flex-col items-center gap-1 border-l border-slate-800 bg-slate-950 py-3">
        {TABS.map((t) => (
          <button
            key={t.id}
            title={t.title}
            onClick={() => setOpen(open === t.id ? null : t.id)}
            className={`flex h-9 w-9 items-center justify-center rounded-lg transition ${
              open === t.id
                ? 'bg-sky-500/20 text-sky-300'
                : 'text-slate-500 hover:bg-slate-800 hover:text-slate-200'
            }`}
          >
            {t.icon}
          </button>
        ))}
      </nav>
    </div>
  );
}
