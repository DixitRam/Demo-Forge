import { useState, type ReactNode } from 'react';
import type { CaptionCue, DemoRecording, ScriptLine, ZoomKeyframe } from '@demoforge/core';
import type { FrameStyle } from '../render/style.js';
import type { Selection } from '../timeline/Timeline.js';
import BackgroundPanel from './BackgroundPanel.js';
import CaptionsPanel from './CaptionsPanel.js';
import CursorPanel from './CursorPanel.js';
import EffectsPanel from './EffectsPanel.js';
import LayoutPanel from './LayoutPanel.js';
import ScriptPanel from './ScriptPanel.js';
import ZoomPanel from './ZoomPanel.js';
import type { ProviderInfo } from '../voice/tts.js';
import type { WriterStatus } from '../voice/writeScript.js';
import type { VoiceProgress } from '../voice/useVoice.js';
import {
  IconCaption,
  IconCursor,
  IconImage,
  IconLayout,
  IconScript,
  IconSliders,
  IconZoom,
} from './icons.js';

type PanelId = 'script' | 'background' | 'zoom' | 'captions' | 'effects' | 'layout' | 'cursor';

const TABS: Array<{ id: PanelId; title: string; icon: ReactNode }> = [
  { id: 'script', title: 'Script & voice', icon: <IconScript /> },
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
  script: ScriptLine[];
  setScript: (s: ScriptLine[]) => void;
  brief: string;
  setBrief: (b: string) => void;
  writer: WriterStatus | null;
  writing: string | null;
  writeError: string | null;
  onWrite: () => void;
  onSeek: (ms: number) => void;
  voiceProviders: ProviderInfo[] | null;
  voiceProgress: VoiceProgress | null;
  voiceError: string | null;
  hasNarration: boolean;
  onGenerateVoice: () => void;
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
  const selLine = p.selection?.kind === 'script' ? p.selection.index : null;

  return (
    <div className="flex min-h-0 overflow-hidden rounded-2xl bg-zinc-900 ring-1 ring-white/5">
      {active && (
        <aside className="flex w-72 shrink-0 flex-col overflow-y-auto text-xs">
          <header className="sticky top-0 z-10 flex items-center justify-between bg-zinc-900 px-4 pt-4 pb-3">
            <h2 className="text-sm font-semibold text-zinc-100">{active.title}</h2>
            <button
              onClick={() => setOpen(null)}
              title="Collapse panel"
              className="rounded px-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
            >
              ›
            </button>
          </header>
          <div className="p-4">
            {open === 'script' && (
              <ScriptPanel
                rec={p.rec}
                script={p.script}
                setScript={p.setScript}
                brief={p.brief}
                setBrief={p.setBrief}
                writer={p.writer}
                writing={p.writing}
                writeError={p.writeError}
                onWrite={p.onWrite}
                style={p.style}
                setStyle={p.setStyle}
                selected={selLine}
                onSelect={(i) => p.onSelect(i === null ? null : { kind: 'script', index: i })}
                timeMs={p.timeMs}
                onSeek={p.onSeek}
                providers={p.voiceProviders}
                progress={p.voiceProgress}
                error={p.voiceError}
                hasNarration={p.hasNarration}
                onGenerate={p.onGenerateVoice}
              />
            )}
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

      <nav className="flex w-14 shrink-0 flex-col items-center gap-1.5 border-l border-white/5 py-3">
        {TABS.map((t) => (
          <button
            key={t.id}
            title={t.title}
            onClick={() => setOpen(open === t.id ? null : t.id)}
            className={`flex h-10 w-10 items-center justify-center rounded-xl transition ${
              open === t.id
                ? 'bg-blue-500/15 text-blue-400'
                : 'text-zinc-500 hover:bg-white/5 hover:text-zinc-200'
            }`}
          >
            {t.icon}
          </button>
        ))}
      </nav>
    </div>
  );
}
