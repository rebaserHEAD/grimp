import React from 'react';
import type { ComponentEditorProps } from './types';

export const BatteryEditor: React.FC<ComponentEditorProps> = ({ component, onChange }) => {
  const maxCharge = (component.maxCharge as number) ?? 0;
  const startingCharge = (component.startingCharge as number) ?? 0;

  const handleChange = (field: string, value: string) => {
    const num = parseFloat(value);
    if (!isNaN(num)) {
      onChange({ ...component, [field]: num });
    }
  };

  return (
    <div className="py-0.5">
      <div className="flex items-center gap-1 mb-0.5">
        <label className="text-muted text-[10px] min-w-[80px] shrink-0">maxCharge</label>
        <input
          type="number"
          value={maxCharge}
          onChange={(e) => handleChange('maxCharge', e.target.value)}
          className="bg-elevated border border-subtle rounded-sm text-primary text-[10px] px-1 py-0.5 flex-1 w-0"
        />
      </div>
      <div className="flex items-center gap-1">
        <label className="text-muted text-[10px] min-w-[80px] shrink-0">startingCharge</label>
        <input
          type="number"
          value={startingCharge}
          onChange={(e) => handleChange('startingCharge', e.target.value)}
          className="bg-elevated border border-subtle rounded-sm text-primary text-[10px] px-1 py-0.5 flex-1 w-0"
        />
      </div>
    </div>
  );
};
