import React, { useEffect, useMemo, useState } from 'react';
import type { ValidationIssue } from '../validation/mapValidator';
import { getValidationRules } from '../validation/mapValidator';

interface ValidatorModalProps {
  issues: ValidationIssue[];
  onJumpTo: (x: number, y: number) => void;
  onClose: () => void;
}

const ValidatorModal: React.FC<ValidatorModalProps> = ({ issues, onJumpTo, onClose }) => {
  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const rules = useMemo(() => getValidationRules(), []);

  const ruleMap = useMemo(() => {
    const map = new Map<string, { id: string; label: string; severity: 'error' | 'warning' }>();
    for (const r of rules) map.set(r.id, r);
    return map;
  }, [rules]);

  const grouped = useMemo(() => {
    const groups = new Map<string, ValidationIssue[]>();
    for (const issue of issues) {
      let list = groups.get(issue.ruleId);
      if (!list) {
        list = [];
        groups.set(issue.ruleId, list);
      }
      list.push(issue);
    }
    return groups;
  }, [issues]);

  const errorCount = issues.filter(i => i.severity === 'error').length;
  const warningCount = issues.filter(i => i.severity === 'warning').length;

  return (
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-elevated border border-subtle rounded-lg p-6 max-w-[550px] w-full max-h-[70vh] overflow-y-auto text-primary text-[13px]">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-accent m-0">Map Validation</h2>
          <button
            onClick={onClose}
            className="bg-transparent border-none text-muted hover:text-primary cursor-pointer text-lg leading-none px-1"
          >
            &times;
          </button>
        </div>

        {issues.length === 0 ? (
          <div className="text-center py-8">
            <div className="text-success text-2xl mb-2">&#10003;</div>
            <div className="text-success font-semibold">No issues found</div>
          </div>
        ) : (
          <>
            <div className="mb-4 text-[12px]">
              {errorCount > 0 && (
                <span className="text-danger font-semibold">{errorCount} error{errorCount !== 1 ? 's' : ''}</span>
              )}
              {errorCount > 0 && warningCount > 0 && <span className="text-muted">, </span>}
              {warningCount > 0 && (
                <span className="text-warning font-semibold">{warningCount} warning{warningCount !== 1 ? 's' : ''}</span>
              )}
            </div>

            {Array.from(grouped.entries()).map(([ruleId, ruleIssues]) => (
              <CollapsibleRuleGroup
                key={ruleId}
                ruleId={ruleId}
                ruleIssues={ruleIssues}
                rule={ruleMap.get(ruleId)}
                onJumpTo={onJumpTo}
                onClose={onClose}
              />
            ))}
          </>
        )}

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

// ---- Collapsible rule group ----

const CollapsibleRuleGroup: React.FC<{
  ruleId: string;
  ruleIssues: ValidationIssue[];
  rule?: { id: string; label: string; severity: 'error' | 'warning' };
  onJumpTo: (x: number, y: number) => void;
  onClose: () => void;
}> = ({ ruleId, ruleIssues, rule, onJumpTo, onClose }) => {
  const [expanded, setExpanded] = useState(false);
  const severity = rule?.severity ?? ruleIssues[0]?.severity ?? 'warning';
  const label = rule?.label ?? ruleId;

  return (
    <div className="mb-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 w-full text-left bg-transparent border-none cursor-pointer py-1 px-0 hover:bg-hover rounded"
      >
        <span className="text-muted text-[10px]">{expanded ? '\u25BC' : '\u25B6'}</span>
        <span className={severity === 'error' ? 'text-danger' : 'text-warning'}>
          {severity === 'error' ? '\u25CF' : '\u26A0'}
        </span>
        <span className="font-semibold text-primary text-[13px]">{label}</span>
        <span className="text-muted text-[11px]">({ruleIssues.length})</span>
      </button>
      {expanded && (
        <div className="ml-5 mt-0.5">
          {ruleIssues.map((issue, idx) => (
            <div
              key={idx}
              className="text-[11px] text-primary py-0.5 px-1 rounded hover:bg-hover cursor-pointer"
              onClick={() => { onJumpTo(issue.x, issue.y); onClose(); }}
            >
              {issue.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ValidatorModal;
