import React, { useEffect, useState } from 'react';
import type { ViewSettings } from '../settings/settingsStore';

interface Props {
  view: ViewSettings;
  onToggleView: (key: keyof ViewSettings) => void;
  onClose: () => void;
}

interface ToggleRow {
  key: keyof ViewSettings;
  label: string;
  description: string;
}

const VIEW_ROWS: ToggleRow[] = [
  { key: 'showGrid', label: 'Grid lines', description: 'Draw the tile grid over the canvas.' },
  { key: 'showEntities', label: 'Entities', description: 'Render entities on the canvas.' },
  { key: 'showSpaceBackground', label: 'Space background', description: 'Starfield behind the grid.' },
  { key: 'showSubFloor', label: 'T-Ray view', description: 'Reveal subfloor entities (cables, pipes).' },
  { key: 'showConnections', label: 'Connection overlay', description: 'Draw cable and pipe network links.' },
];

const DEBUG_ROWS: ToggleRow[] = [
  { key: 'showPerfHUD', label: 'Performance HUD', description: 'Frame timing overlay in the corner.' },
];

const SECTIONS = [
  { id: 'view', label: 'View', rows: VIEW_ROWS },
  { id: 'debug', label: 'Debug', rows: DEBUG_ROWS },
] as const;

/**
 * Application settings window (issue #19). Sections in a left rail, toggle
 * rows on the right. Values apply live and persist through the settings
 * store; there is no OK/Apply step.
 */
export const SettingsModal: React.FC<Props> = ({ view, onToggleView, onClose }) => {
  const [activeSection, setActiveSection] = useState<(typeof SECTIONS)[number]['id']>('view');

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
            {section.rows.map((row) => (
              <label
                key={row.key}
                className="flex items-start justify-between gap-4 py-2.5 border-b border-subtle/50 cursor-pointer select-none"
              >
                <span className="min-w-0">
                  <span className="block text-xs text-primary">{row.label}</span>
                  <span className="block text-[11px] text-muted leading-snug">{row.description}</span>
                </span>
                <input
                  type="checkbox"
                  checked={view[row.key]}
                  onChange={() => onToggleView(row.key)}
                  className="mt-0.5 shrink-0 accent-accent cursor-pointer"
                />
              </label>
            ))}
          </div>
          <div className="px-5 py-2.5 border-t border-subtle text-[11px] text-muted">
            Changes apply immediately and persist across launches.
          </div>
        </div>
      </div>
    </div>
  );
};
