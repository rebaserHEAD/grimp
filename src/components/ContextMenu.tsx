import React, { useEffect, useRef, useCallback } from 'react';

export interface ContextMenuItem {
  label: string;
  action: () => void;
  disabled?: boolean;
  shortcut?: string;
}

interface Props {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}


export function ContextMenu({ x, y, items, onClose }: Props) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [hoveredIndex, setHoveredIndex] = React.useState<number | null>(null);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    },
    [onClose],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const handleItemClick = (item: ContextMenuItem) => {
    if (item.disabled) return;
    item.action();
    onClose();
  };

  return (
    <>
      {/* Invisible overlay to catch clicks outside */}
      <div className="fixed inset-0 z-[999]" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }} />
      <div ref={menuRef} className="fixed bg-elevated border border-subtle rounded shadow-lg min-w-[160px] py-1 z-[1000] text-xs text-primary font-inherit" style={{ left: x, top: y }} role="menu">
        {items.map((item, i) => (
          <div
            key={i}
            role="menuitem"
            className={`flex justify-between items-center px-3 py-1.5 select-none gap-4 ${
              item.disabled ? 'text-muted cursor-default' : 'cursor-pointer text-primary'
            } ${hoveredIndex === i && !item.disabled ? 'bg-active' : ''}`}
            onClick={() => handleItemClick(item)}
            onMouseEnter={() => setHoveredIndex(i)}
            onMouseLeave={() => setHoveredIndex(null)}
          >
            <span>{item.label}</span>
            {item.shortcut && (
              <span className="text-muted text-[11px] ml-4">{item.shortcut}</span>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
