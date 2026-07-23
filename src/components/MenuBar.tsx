import React, { useRef, useState, useEffect, useCallback } from 'react';

interface Props {
  onNewMap: () => void;
  onNewGrid: () => void;
  /** Document kind per the engine's meta.category (savemap → Map, savegrid → Grid). */
  documentKind: 'Map' | 'Grid';
  onImport: (content: string) => void;
  onExport: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  dirty: boolean;
  showGrid: boolean;
  onToggleGrid: () => void;
  showEntities: boolean;
  onToggleEntities: () => void;
  showSpaceBackground: boolean;
  onToggleSpaceBackground: () => void;
  showLighting: boolean;
  onToggleLighting: () => void;
  showPerfHUD: boolean;
  onTogglePerfHUD: () => void;
  showBenchmark: boolean;
  onToggleBenchmark: () => void;
  showShortcuts: boolean;
  onShowShortcuts: () => void;
  onCloseShortcuts: () => void;
  forkName?: string;
  onSwitchFork?: () => void;
  /** When true (Electron), the native menu owns File/Edit/View, so hide the
   * in-app dropdowns and keep only the title, fork chip, and dirty indicator. */
  nativeMenus?: boolean;
}

interface MenuItem {
  label: string;
  shortcut?: string;
  action?: () => void;
  disabled?: boolean;
  checked?: boolean;
  separator?: boolean;
}

const MenuDropdown: React.FC<{
  label: string;
  items: MenuItem[];
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  hoverOpen: boolean;
  onHoverOpen: () => void;
}> = ({ label, items, isOpen, onOpen, onClose, hoverOpen, onHoverOpen }) => {
  const ref = useRef<HTMLDivElement>(null);

  return (
    <div ref={ref} className="relative">
      <button
        className={`px-3 py-1 text-xs text-primary cursor-pointer hover:bg-hover rounded-sm border-none h-full ${
          isOpen ? 'bg-active' : 'bg-transparent'
        }`}
        onClick={() => isOpen ? onClose() : onOpen()}
        onMouseEnter={() => { if (hoverOpen) onHoverOpen(); }}
      >
        {label}
      </button>
      {isOpen && (
        <div className="absolute top-full left-0 min-w-[160px] bg-elevated border border-subtle rounded-sm shadow-lg z-50 py-1">
          {items.map((item, i) => {
            if (item.separator) {
              return <div key={i} className="h-px bg-subtle mx-2 my-1" />;
            }
            return (
              <button
                key={i}
                disabled={item.disabled}
                onClick={() => {
                  item.action?.();
                  onClose();
                }}
                className={`flex w-full px-3 py-1.5 text-xs text-left items-center gap-2 border-none bg-transparent ${
                  item.disabled
                    ? 'text-muted cursor-default hover:bg-transparent'
                    : 'text-primary cursor-pointer hover:bg-hover'
                }`}
              >
                <span className="w-[18px] text-center text-[11px]">
                  {item.checked !== undefined ? (item.checked ? '\u2713' : '') : ''}
                </span>
                <span className="flex-1">{item.label}</span>
                {item.shortcut && (
                  <span className="text-muted ml-4 text-[10px]">{item.shortcut}</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export const MenuBar: React.FC<Props> = ({
  onNewMap, onNewGrid, documentKind, onImport, onExport, onUndo, onRedo, canUndo, canRedo, dirty,
  showGrid, onToggleGrid, showEntities, onToggleEntities,
  showSpaceBackground, onToggleSpaceBackground,
  showLighting, onToggleLighting,
  showPerfHUD, onTogglePerfHUD,
  showBenchmark, onToggleBenchmark,
  showShortcuts, onShowShortcuts, onCloseShortcuts,
  forkName, onSwitchFork, nativeMenus,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [showForkMenu, setShowForkMenu] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);
  const forkMenuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    if (!openMenu) return;
    const handler = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [openMenu]);

  // Close fork menu when clicking outside
  useEffect(() => {
    if (!showForkMenu) return;
    const handler = (e: MouseEvent) => {
      if (forkMenuRef.current && !forkMenuRef.current.contains(e.target as Node)) {
        setShowForkMenu(false);
      }
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [showForkMenu]);

  const handleImportClick = () => fileInputRef.current?.click();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    file.text().then(onImport);
    e.target.value = '';
  };

  const handleNewMap = () => {
    if (dirty && !window.confirm('Unsaved changes will be lost. Continue?')) return;
    onNewMap();
  };

  const handleNewGrid = () => {
    if (dirty && !window.confirm('Unsaved changes will be lost. Continue?')) return;
    onNewGrid();
  };

  const openMenuFn = useCallback((name: string) => setOpenMenu(name), []);
  const closeMenu = useCallback(() => setOpenMenu(null), []);

  const fileItems: MenuItem[] = [
    { label: 'New Map', shortcut: 'Ctrl+N', action: handleNewMap },
    { label: 'New Grid', shortcut: 'Ctrl+Shift+N', action: handleNewGrid },
    { label: 'separator', separator: true },
    { label: 'Import .yml...', shortcut: 'Ctrl+O', action: handleImportClick },
    { label: 'Export .yml', shortcut: 'Ctrl+S', action: onExport },
  ];

  const editItems: MenuItem[] = [
    { label: 'Undo', shortcut: 'Ctrl+Z', action: onUndo, disabled: !canUndo },
    { label: 'Redo', shortcut: 'Ctrl+Y', action: onRedo, disabled: !canRedo },
  ];

  const viewItems: MenuItem[] = [
    { label: 'Show Grid', action: onToggleGrid, checked: showGrid },
    { label: 'Show Entities', action: onToggleEntities, checked: showEntities },
    { label: 'Space Background', action: onToggleSpaceBackground, checked: showSpaceBackground },
    { label: 'Lighting Preview', action: onToggleLighting, checked: showLighting },
    { label: 'separator', separator: true },
    { label: 'Performance HUD', action: onTogglePerfHUD, checked: showPerfHUD },
    { label: 'Benchmark Tool', action: onToggleBenchmark, checked: showBenchmark },
    { label: 'separator', separator: true },
    { label: 'Controls', shortcut: '?', action: onShowShortcuts },
  ];

  const menus: { name: string; items: MenuItem[] }[] = [
    { name: 'File', items: fileItems },
    { name: 'Edit', items: editItems },
    { name: 'View', items: viewItems },
  ];

  return (
    <div ref={barRef} className="flex items-center h-9 bg-surface border-b border-subtle px-2 gap-1">
      <span className="text-[13px] font-bold text-accent mr-3">
        SS14 Map Editor
      </span>

      {!nativeMenus && menus.map(menu => (
        <MenuDropdown
          key={menu.name}
          label={menu.name}
          items={menu.items}
          isOpen={openMenu === menu.name}
          onOpen={() => openMenuFn(menu.name)}
          onClose={closeMenu}
          hoverOpen={openMenu !== null}
          onHoverOpen={() => openMenuFn(menu.name)}
        />
      ))}

      <span
        className="ml-2 text-[10px] uppercase tracking-wider text-muted border border-subtle rounded-sm px-1.5 py-0.5 select-none"
        title={documentKind === 'Grid'
          ? 'Grid document: loads onto an existing map (savegrid format)'
          : 'Map document: a full map with its own map entity (savemap format)'}
      >
        {documentKind}
      </span>

      {forkName && (
        <div className="relative ml-2" ref={forkMenuRef}>
          <button
            onClick={() => setShowForkMenu(!showForkMenu)}
            className="flex items-center gap-1.5 text-[11px] text-muted hover:text-primary cursor-pointer bg-transparent border border-subtle rounded-sm px-2 py-0.5"
            title="Active fork"
          >
            <span className="text-[10px]">{'\uD83D\uDCC1'}</span>
            <span>{forkName}</span>
          </button>
          {showForkMenu && (
            <div className="absolute left-0 top-full mt-1 bg-elevated border border-subtle rounded shadow-lg z-50 py-1 min-w-[160px]">
              <button
                onClick={() => { setShowForkMenu(false); onSwitchFork?.(); }}
                className="w-full text-left px-3 py-1.5 text-[11px] text-primary hover:bg-hover cursor-pointer bg-transparent border-none"
              >
                Switch Fork...
              </button>
            </div>
          )}
        </div>
      )}

      <div className="flex-1" />

      {dirty && (
        <span className="text-warning text-[10px]">Unsaved changes</span>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".yml,.yaml"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      {showShortcuts && <ShortcutsModal onClose={onCloseShortcuts} />}
    </div>
  );
};

/* ── Shortcuts Modal ─────────────────────────────────────── */

const SHORTCUT_SECTIONS: { title: string; rows: [string, string][] }[] = [
  {
    title: 'Tool Selection',
    rows: [
      ['B', 'Paint'],
      ['E', 'Erase'],
      ['I', 'Eyedropper'],
      ['H', 'Pan'],
      ['G', 'Fill'],
      ['R', 'Rectangle'],
      ['L', 'Line'],
      ['C', 'Circle'],
      ['S', 'Select (tiles + entities)'],
      ['V', 'Entity Select'],
      ['P', 'Entity Place'],
      ['K', 'Cable Draw'],
      ['J', 'Pipe Draw'],
      ['D', 'Device Link'],
    ],
  },
  {
    title: 'General',
    rows: [
      ['Ctrl+Z', 'Undo'],
      ['Ctrl+Y / Ctrl+Shift+Z', 'Redo'],
      ['Ctrl+N', 'New Map'],
      ['Ctrl+Shift+N', 'New Grid'],
      ['Ctrl+O', 'Import .yml'],
      ['Ctrl+S', 'Export .yml'],
      ['Ctrl+F', 'Search entities on map'],
      ['Space (hold)', 'Pan mode'],
      ['Escape', 'Cancel / close menu'],
      ['?', 'This dialog'],
    ],
  },
  {
    title: 'Clipboard (Select Tool)',
    rows: [
      ['Ctrl+C', 'Copy'],
      ['Ctrl+X', 'Cut'],
      ['Ctrl+V', 'Paste'],
      ['Delete / Backspace', 'Delete selection'],
    ],
  },
  {
    title: 'Entity Rotation',
    rows: [
      ['R', 'Rotate CW (90\u00b0)'],
      ['Shift+R', 'Rotate CCW (90\u00b0)'],
    ],
  },
  {
    title: 'Mouse',
    rows: [
      ['Scroll', 'Zoom in / out'],
      ['Middle drag', 'Pan'],
      ['Click + drag', 'Use active tool'],
      ['Shift + click', 'Free placement / toggle select'],
      ['Shift + drag', 'Free-move entity (fractional)'],
      ['Right click', 'Deselect / context menu / erase'],
      ['Scroll on entity stack', 'Cycle overlapping entities'],
    ],
  },
];

const ShortcutsModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-elevated border border-subtle rounded-lg p-6 max-w-[560px] w-full max-h-[80vh] overflow-y-auto text-primary text-[13px]">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-accent m-0">Controls</h2>
          <button
            onClick={onClose}
            className="bg-transparent border-none text-muted hover:text-primary cursor-pointer text-lg leading-none px-1"
          >
            &times;
          </button>
        </div>

        {SHORTCUT_SECTIONS.map((section) => (
          <div key={section.title} className="mb-4">
            <h3 className="text-[11px] uppercase tracking-wider text-muted mb-1.5 font-semibold">
              {section.title}
            </h3>
            <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5">
              {section.rows.map(([key, desc]) => (
                <React.Fragment key={key + desc}>
                  <kbd className="text-accent font-mono text-[12px] text-right whitespace-nowrap">{key}</kbd>
                  <span className="text-primary">{desc}</span>
                </React.Fragment>
              ))}
            </div>
          </div>
        ))}

        <div className="text-center mt-4">
          <button
            onClick={onClose}
            className="bg-active border border-subtle rounded text-primary text-[13px] px-6 py-2 cursor-pointer hover:bg-hover"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
