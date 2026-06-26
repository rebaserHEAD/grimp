import React from 'react';
import type { ComponentEditorProps } from './types';

export const MetaDataEditor: React.FC<ComponentEditorProps> = ({ component, onChange }) => {
  const name = (component.name as string) ?? '';

  return (
    <div className="py-0.5">
      <label className="text-muted text-[10px] mr-1">name</label>
      <input
        type="text"
        value={name}
        onChange={(e) => onChange({ ...component, name: e.target.value })}
        className="bg-elevated border border-subtle rounded-sm text-primary text-[10px] px-1 py-0.5 w-full box-border"
      />
    </div>
  );
};
