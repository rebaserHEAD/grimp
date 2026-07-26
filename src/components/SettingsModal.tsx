import React, { useEffect, useState } from 'react';

interface Props {
  forksDirectory: string | null;
  recentForksCount: number;
  recentFilesCount: number;
  onChooseForksDirectory: () => void;
  onClearForksDirectory: () => void;
  onClearRecentForks: () => void;
  onClearRecentFiles: () => void;
  onClose: () => void;
}

const isElectron = typeof window !== 'undefined' && !!window.electronFork?.available;

const SECTIONS = [
  { id: 'forks', label: 'Forks' },
  { id: 'files', label: 'Files' },
] as const;

/**
 * Application settings window (issue #19): the home for set-rarely
 * configuration. Frequently-flipped workspace state (view toggles, overlays)
 * lives in the View menu instead, not here; the store still persists those
 * transparently. Changes apply live; there is no OK/Apply step.
 */
export const SettingsModal: React.FC<Props> = ({
  forksDirectory,
  recentForksCount,
  recentFilesCount,
  onChooseForksDirectory,
  onClearForksDirectory,
  onClearRecentForks,
  onClearRecentFiles,
  onClose,
}) => {
  const [activeSection, setActiveSection] = useState<(typeof SECTIONS)[number]['id']>('forks');

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const section = SECTIONS.find((s) => s.id === activeSection) ?? SECTIONS[0];

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70" onClick={onClose}>
      <div
        className="flex w-full max-w-[640px] h-[420px] mx-4 bg-elevated border border-subtle rounded-lg overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Section rail */}
        <div className="w-[150px] shrink-0 bg-panel border-r border-subtle py-2">
          <div className="px-4 py-2 text-[9px] uppercase tracking-wider text-muted">Settings</div>
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => setActiveSection(s.id)}
              className={`block w-full text-left px-4 py-1.5 text-xs cursor-pointer border-none
                ${s.id === activeSection ? 'bg-active text-accent' : 'bg-transparent text-primary hover:bg-hover'}`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Section content */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex items-center justify-between px-5 py-3 border-b border-subtle">
            <h2 className="text-sm font-medium text-primary">{section.label}</h2>
            <button
              onClick={onClose}
              className="text-muted hover:text-primary bg-transparent border-none cursor-pointer text-base leading-none"
              title="Close (Esc)"
            >
              ×
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-3">
            {!isElectron ? (
              <p className="text-xs text-muted py-2">Fork and file management is available in the desktop app.</p>
            ) : section.id === 'files' ? (
              <div className="py-2.5 border-b border-subtle/50">
                <div className="flex items-start justify-between gap-4">
                  <span className="min-w-0">
                    <span className="block text-xs text-primary">Recent files</span>
                    <span className="block text-[11px] text-muted leading-snug">
                      The launch screen remembers the maps and grids you open, along with the fork they belong to.
                    </span>
                  </span>
                  <button
                    onClick={onClearRecentFiles}
                    disabled={recentFilesCount === 0}
                    className="shrink-0 bg-subtle border border-subtle rounded text-primary text-[11px] px-3 py-1.5
                               cursor-pointer hover:bg-hover disabled:opacity-50 disabled:cursor-default"
                  >
                    Clear list{recentFilesCount > 0 ? ` (${recentFilesCount})` : ''}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="py-2.5 border-b border-subtle/50">
                  <div className="flex items-start justify-between gap-4">
                    <span className="min-w-0">
                      <span className="block text-xs text-primary">Forks folder</span>
                      <span className="block text-[11px] text-muted leading-snug">
                        Scanned for fork checkouts on the launch screen; the fork picker starts here.
                      </span>
                      <span
                        className="block text-[11px] text-primary truncate mt-1"
                        title={forksDirectory ?? undefined}
                      >
                        {forksDirectory ?? 'Not set'}
                      </span>
                    </span>
                    <span className="flex gap-2 shrink-0">
                      <button
                        onClick={onChooseForksDirectory}
                        className="bg-active border border-subtle rounded text-white text-[11px] px-3 py-1.5 cursor-pointer hover:brightness-110"
                      >
                        Change…
                      </button>
                      {forksDirectory && (
                        <button
                          onClick={onClearForksDirectory}
                          className="bg-subtle border border-subtle rounded text-primary text-[11px] px-3 py-1.5 cursor-pointer hover:bg-hover"
                        >
                          Clear
                        </button>
                      )}
                    </span>
                  </div>
                </div>

                <div className="py-2.5 border-b border-subtle/50">
                  <div className="flex items-start justify-between gap-4">
                    <span className="min-w-0">
                      <span className="block text-xs text-primary">Recent forks</span>
                      <span className="block text-[11px] text-muted leading-snug">
                        The launch screen remembers the forks you load for one-click reopening.
                      </span>
                    </span>
                    <button
                      onClick={onClearRecentForks}
                      disabled={recentForksCount === 0}
                      className="shrink-0 bg-subtle border border-subtle rounded text-primary text-[11px] px-3 py-1.5
                                 cursor-pointer hover:bg-hover disabled:opacity-50 disabled:cursor-default"
                    >
                      Clear list{recentForksCount > 0 ? ` (${recentForksCount})` : ''}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
          <div className="px-5 py-2.5 border-t border-subtle text-[11px] text-muted">
            Changes apply immediately and persist across launches.
          </div>
        </div>
      </div>
    </div>
  );
};
