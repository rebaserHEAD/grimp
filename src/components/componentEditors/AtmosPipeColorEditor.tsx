import React from 'react';
import type { ComponentEditorProps } from './types';

const COLOR_PRESETS: { label: string; value: string }[] = [
  { label: 'Supply Blue', value: '#0055CCFF' },
  { label: 'Return Red', value: '#990000FF' },
];

export const AtmosPipeColorEditor: React.FC<ComponentEditorProps> = ({ component, onChange }) => {
  const color = (component.color as string) ?? '';

  const handleColorChange = (value: string) => {
    onChange({ ...component, color: value });
  };

  return (
    <div className="py-0.5">
      <label className="text-muted text-[10px] block mb-px">color</label>
      <div className="flex gap-1 mb-0.5 flex-wrap">
        {COLOR_PRESETS.map((preset) => (
          <button
            key={preset.value}
            onClick={() => handleColorChange(preset.value)}
            className={`bg-elevated rounded-sm text-primary text-[9px] px-1.5 py-0.5 cursor-pointer border ${
              color === preset.value ? 'border-[#5588cc]' : 'border-subtle'
            }`}
            title={preset.value}
          >
            <span
              className="inline-block w-2.5 h-2.5 rounded-sm mr-[3px] align-middle"
              style={{ backgroundColor: preset.value.slice(0, 7) }}
            />
            {preset.label}
          </button>
        ))}
      </div>
      <input
        type="text"
        value={color}
        onChange={(e) => handleColorChange(e.target.value)}
        placeholder="#RRGGBBAA"
        className="bg-elevated border border-subtle rounded-sm text-primary text-[10px] px-1 py-0.5 w-full box-border"
      />
    </div>
  );
};
