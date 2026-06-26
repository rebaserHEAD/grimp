import React, { useState } from 'react';
import type { ComponentEditorProps } from './types';

interface PortLink {
  targetUid: number;
  sourcePort: string;
  sinkPort: string;
}

export const DeviceLinkSourceEditor: React.FC<ComponentEditorProps> = ({ component, onChange, allEntities }) => {
  const linkedPorts = (component.linkedPorts as Record<string, [string, string][]>) ?? {};
  const [adding, setAdding] = useState(false);
  const [newTargetUid, setNewTargetUid] = useState('');
  const [newSourcePort, setNewSourcePort] = useState('');
  const [newSinkPort, setNewSinkPort] = useState('');

  const resolveUid = (uid: number): string => {
    if (!allEntities) return `UID ${uid}`;
    const ent = allEntities.find((e) => e.uid === uid);
    return ent ? `UID ${uid} (${ent.prototype})` : `UID ${uid}`;
  };

  const isMissing = (uid: number): boolean => {
    if (!allEntities) return false;
    return !allEntities.some((e) => e.uid === uid);
  };

  // Flatten linkedPorts into row data for display
  const rows: PortLink[] = [];
  for (const [uidStr, pairs] of Object.entries(linkedPorts)) {
    const uid = parseInt(uidStr, 10);
    for (const [sourcePort, sinkPort] of pairs) {
      rows.push({ targetUid: uid, sourcePort, sinkPort });
    }
  }

  const handleRemove = (targetUid: number, sourcePort: string, sinkPort: string) => {
    const uidStr = String(targetUid);
    const updated = { ...linkedPorts };
    if (updated[uidStr]) {
      updated[uidStr] = updated[uidStr].filter(
        ([sp, sk]) => sp !== sourcePort || sk !== sinkPort
      );
      if (updated[uidStr].length === 0) {
        delete updated[uidStr];
      }
    }
    onChange({ ...component, linkedPorts: updated });
  };

  const handleAdd = () => {
    const uid = parseInt(newTargetUid, 10);
    if (isNaN(uid) || !newSourcePort.trim() || !newSinkPort.trim()) return;

    const updated = { ...linkedPorts };
    const uidStr = String(uid);
    if (!updated[uidStr]) {
      updated[uidStr] = [];
    }
    updated[uidStr] = [...updated[uidStr], [newSourcePort.trim(), newSinkPort.trim()] as [string, string]];
    onChange({ ...component, linkedPorts: updated });
    setAdding(false);
    setNewTargetUid('');
    setNewSourcePort('');
    setNewSinkPort('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleAdd();
    } else if (e.key === 'Escape') {
      setAdding(false);
      setNewTargetUid('');
      setNewSourcePort('');
      setNewSinkPort('');
    }
  };

  return (
    <div className="py-0.5">
      <div className="text-muted text-[10px] mb-0.5">linkedPorts</div>
      {rows.length === 0 && (
        <div className="text-[#666] text-[10px] italic mb-0.5">
          No linked ports
        </div>
      )}
      {/* Header */}
      {rows.length > 0 && (
        <div className="flex gap-1 mb-px text-[9px] text-[#666]">
          <span className="flex-[2] min-w-0">Target</span>
          <span className="flex-1 min-w-0">Source Port</span>
          <span className="flex-1 min-w-0">Sink Port</span>
          <span className="w-4" />
        </div>
      )}
      {rows.map((row, i) => (
        <div key={i} className="flex items-center gap-1 mb-px text-[10px]">
          <span className="text-primary text-[10px] flex-[2] min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
            <span>
              {resolveUid(row.targetUid)}
            </span>
            {isMissing(row.targetUid) && <span className="text-[#ff6666] text-[9px]"> (missing)</span>}
          </span>
          <span className="text-[#c0c0e0] text-[10px] flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{row.sourcePort}</span>
          <span className="text-[#c0c0e0] text-[10px] flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{row.sinkPort}</span>
          <button
            onClick={() => handleRemove(row.targetUid, row.sourcePort, row.sinkPort)}
            className="bg-transparent border-none text-[#ff6666] text-[10px] cursor-pointer px-0.5 py-0 leading-none shrink-0 w-4"
            title="Remove link"
          >
            x
          </button>
        </div>
      ))}
      {adding ? (
        <div className="mt-0.5">
          <div className="flex gap-1 mb-0.5">
            <input
              type="number"
              value={newTargetUid}
              onChange={(e) => setNewTargetUid(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Target UID"
              className="bg-elevated border border-subtle rounded-sm text-primary text-[10px] px-1 py-0.5 w-0 flex-1"
              autoFocus
            />
          </div>
          <div className="flex gap-1 mb-0.5">
            <input
              type="text"
              value={newSourcePort}
              onChange={(e) => setNewSourcePort(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Source port"
              className="bg-elevated border border-subtle rounded-sm text-primary text-[10px] px-1 py-0.5 w-0 flex-1"
            />
            <input
              type="text"
              value={newSinkPort}
              onChange={(e) => setNewSinkPort(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Sink port"
              className="bg-elevated border border-subtle rounded-sm text-primary text-[10px] px-1 py-0.5 w-0 flex-1"
            />
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} className="bg-transparent border border-subtle rounded-sm text-muted text-[10px] cursor-pointer px-1.5 py-0.5 mt-0.5">
          + Add Link
        </button>
      )}
    </div>
  );
};
