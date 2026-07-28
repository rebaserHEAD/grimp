import React, { useEffect, useRef, useState } from 'react';

interface Props {
  title: string;
  message?: string;
  defaultValue?: string | undefined;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}

/**
 * Text-input replacement for window.prompt(), which silently no-ops under
 * Electron. Enter submits (when non-empty), Escape cancels, click-outside cancels.
 */
export const PromptModal: React.FC<Props> = ({
  title,
  message,
  defaultValue = '',
  placeholder,
  confirmLabel = 'OK',
  cancelLabel = 'Cancel',
  onSubmit,
  onCancel,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(defaultValue);
  const trimmed = value.trim();

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const submit = () => {
    if (trimmed) onSubmit(trimmed);
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70" onClick={onCancel}>
      <div
        className="bg-elevated border border-subtle rounded-lg px-10 py-8 max-w-[480px] w-full mx-4 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src="/images/chief_engineer.png"
          alt=""
          className="h-16 mx-auto mb-3 block"
          style={{ imageRendering: 'pixelated' }}
        />
        <h2 className="text-white text-xl mb-4">{title}</h2>
        {message && <p className="text-primary text-sm mb-4 leading-relaxed">{message}</p>}
        <input
          ref={inputRef}
          type="text"
          value={value}
          placeholder={placeholder}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
            if (e.key === 'Escape') onCancel();
          }}
          className="w-full bg-panel border border-subtle rounded px-3 py-2 text-sm text-primary
                     outline-none focus:ring-2 focus:ring-accent/50 mb-6"
        />
        <div className="flex gap-3 justify-center">
          <button
            onClick={onCancel}
            className="bg-subtle border border-subtle rounded text-primary text-sm px-6 py-2.5 cursor-pointer hover:bg-hover"
          >
            {cancelLabel}
          </button>
          <button
            onClick={submit}
            disabled={!trimmed}
            className="bg-active border border-subtle rounded text-white text-sm px-6 py-2.5
                       cursor-pointer hover:brightness-110 disabled:opacity-50 disabled:cursor-default"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
