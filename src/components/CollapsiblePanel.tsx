import React, { useState, useEffect } from 'react';

interface CollapsiblePanelProps {
  /** Panel header title */
  title: string;
  /** Whether the panel starts expanded */
  defaultOpen?: boolean;
  /** Controlled open state, when provided and true, auto-expands the panel */
  forceOpen?: boolean;
  /** Optional extra CSS classes on the outer container */
  className?: string;
  children: React.ReactNode;
}

export const CollapsiblePanel: React.FC<CollapsiblePanelProps> = ({
  title,
  defaultOpen = true,
  forceOpen,
  className = '',
  children,
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  // Auto-expand when forceOpen becomes true (e.g., entity selected)
  useEffect(() => {
    if (forceOpen) setIsOpen(true);
  }, [forceOpen]);

  return (
    <div className={`flex flex-col border-b border-subtle ${className}`}>
      <button
        onClick={() => setIsOpen(prev => !prev)}
        className="flex items-center justify-between w-full px-3 py-1.5
                   bg-surface hover:bg-hover text-primary text-xs font-medium
                   cursor-pointer select-none border-none outline-none"
      >
        <span>{title}</span>
        <span className="text-muted text-[10px]">{isOpen ? '▾' : '▸'}</span>
      </button>
      {isOpen && (
        <div className="overflow-y-auto">
          {children}
        </div>
      )}
    </div>
  );
};
