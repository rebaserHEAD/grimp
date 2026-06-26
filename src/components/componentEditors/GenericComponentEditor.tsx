import React, { useState, useEffect } from 'react';
import type { ComponentEditorProps } from './types';

export const GenericComponentEditor: React.FC<ComponentEditorProps> = ({ component, onChange }) => {
  // Strip `type` from the editable JSON, we add it back on apply
  const { type, ...fields } = component;
  const [text, setText] = useState(() => JSON.stringify(fields, null, 2));
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  // Reset text when component changes externally
  useEffect(() => {
    const { type: _t, ...f } = component;
    const fresh = JSON.stringify(f, null, 2);
    setText(fresh);
    setError(null);
    setDirty(false);
  }, [component]);

  const handleApply = () => {
    try {
      const parsed = JSON.parse(text);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        setError('Must be a JSON object');
        return;
      }
      setError(null);
      setDirty(false);
      onChange({ type, ...parsed });
    } catch (e) {
      setError(String((e as Error).message));
    }
  };

  return (
    <div className="py-0.5">
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setDirty(true);
          setError(null);
        }}
        className="bg-elevated border border-subtle rounded-sm text-primary text-[9px] font-mono px-1 py-0.5 w-full box-border resize-y"
        rows={Math.min(10, text.split('\n').length + 1)}
      />
      {error && (
        <div className="text-[#c44] text-[9px] mt-px">
          Invalid JSON: {error}
        </div>
      )}
      {dirty && (
        <button onClick={handleApply} className="mt-0.5 bg-[#1a3a5e] border border-[#2a4a6a] rounded-sm text-primary text-[9px] px-2 py-0.5 cursor-pointer">
          Apply
        </button>
      )}
    </div>
  );
};
