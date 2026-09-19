import type { CutRegion } from '@demoforge/core';

interface Props {
  cuts: CutRegion[];
  index: number;
  onClose: () => void;
  onDelete: () => void;
}

export default function CutInspector({ cuts, index, onClose, onDelete }: Props) {
  const cut = cuts[index];
  if (!cut) return null;
  const secs = (cut.tEnd - cut.tStart) / 1000;

  return (
    <div className="absolute top-4 right-4 z-10 w-64 rounded-xl border border-zinc-700/80 bg-zinc-900/95 p-4 text-xs shadow-2xl shadow-black/50 backdrop-blur">
      <header className="mb-3 flex items-center gap-2">
        <span className="text-red-300">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
            <circle cx="6" cy="6" r="2.5" />
            <circle cx="6" cy="18" r="2.5" />
            <path d="M8 7.5 20 18M8 16.5 20 6" />
          </svg>
        </span>
        <h3 className="text-sm font-semibold text-zinc-100">Cut {index + 1}</h3>
        <button
          onClick={onClose}
          title="Close"
          className="ml-auto rounded px-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
        >
          ✕
        </button>
      </header>

      <p className="mb-3 leading-relaxed text-zinc-400">
        {secs.toFixed(1)}s of source media hidden from the edited timeline
        <span className="mt-1 block font-mono text-[11px] text-zinc-500">
          {(cut.tStart / 1000).toFixed(2)}s – {(cut.tEnd / 1000).toFixed(2)}s
        </span>
      </p>

      <button
        onClick={onDelete}
        className="w-full rounded-lg border border-red-500/40 bg-red-500/10 py-2 text-red-300 hover:bg-red-500/20"
      >
        Restore (delete cut)
      </button>
    </div>
  );
}
