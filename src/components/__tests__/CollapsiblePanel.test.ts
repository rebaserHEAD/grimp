import { describe, it, expect } from 'vitest';
import { CollapsiblePanel } from '../CollapsiblePanel';

describe('CollapsiblePanel', () => {
  it('exports CollapsiblePanel component', () => {
    expect(CollapsiblePanel).toBeDefined();
    expect(typeof CollapsiblePanel).toBe('function');
  });
});
