import React, { useState } from 'react';
import type { ComponentEditorProps } from './types';

export const DeviceListEditor: React.FC<ComponentEditorProps> = ({ component, onChange, allEntities }) => {
  const devices = (component.devices as number[]) ?? [];
  const [adding, setAdding] = useState(false);
  const [newUid, setNewUid] = useState('');

  const resolveUid = (uid: number): string => {
    if (!allEntities) return `UID ${uid}`;
    const ent = allEntities.find((e) => e.uid === uid);
    return ent ? `UID ${uid} (${ent.prototype})` : `UID ${uid}`;
  };

  const isMissing = (uid: number): boolean => {
    if (!allEntities) return false;
    return !allEntities.some((e) => e.uid === uid);
  };

  const handleRemove = (index: number) => {
    const updated = devices.filter((_, i) => i !== index);
    onChange({ ...component, devices: updated });
  };

  const handleAdd = () => {
    const uid = parseInt(newUid, 10);
    if (!isNaN(uid)) {
      onChange({ ...component, devices: [...devices, uid] });
    }
    setAdding(false);
    setNewUid('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleAdd();
    } else if (e.key === 'Escape') {
      setAdding(false);
      setNewUid('');
    }
  };

  return (
    <div className="py-0.5">
      <div className="text-muted text-[10px] mb-0.5">devices</div>
      {devices.length === 0 && (
        <div className="text-[#666] text-[10px] italic mb-0.5">
          No devices
        </div>
      )}
      {devices.map((uid, i) => (
        <div key={i} className="flex items-center gap-1 mb-px text-[10px] pr-3">
          <span className="text-primary text-[10px] flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{resolveUid(uid)}</span>
          {isMissing(uid) && <span className="text-[#ff6666] text-[9px] shrink-0">(missing)</span>}
          <button
            onClick={() => handleRemove(i)}
            className="bg-transparent border-none text-[#ff6666] text-[10px] cursor-pointer px-1 py-0.5 leading-none shrink-0 hover:text-[#ff4444]"
            title="Remove device"
          >
            ✕
          </button>
        </div>
      ))}
      {adding ? (
        <div className="flex gap-1 mt-0.5">
          <input
            type="number"
            value={newUid}
            onChange={(e) => setNewUid(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="UID"
            className="bg-elevated border border-subtle rounded-sm text-primary text-[10px] px-1 py-0.5 flex-1 w-0"
            autoFocus
          />
        </div>
      ) : (
        <button onClick={() => setAdding(true)} className="bg-transparent border border-subtle rounded-sm text-muted text-[10px] cursor-pointer px-1.5 py-0.5 mt-0.5">
          + Add Device
        </button>
      )}
    </div>
  );
};
