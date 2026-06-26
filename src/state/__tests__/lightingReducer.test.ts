import { describe, it, expect } from 'vitest';
import { editorReducer } from '../editorReducer';
import { createInitialState } from '../editorState';

describe('SET_LIGHTING_ENABLED', () => {
  it('toggles lightingEnabled to true', () => {
    const state = createInitialState();
    expect(state.lightingEnabled).toBe(false);
    const next = editorReducer(state, { type: 'SET_LIGHTING_ENABLED', enabled: true });
    expect(next.lightingEnabled).toBe(true);
  });

  it('toggles lightingEnabled to false', () => {
    const state = { ...createInitialState(), lightingEnabled: true };
    const next = editorReducer(state, { type: 'SET_LIGHTING_ENABLED', enabled: false });
    expect(next.lightingEnabled).toBe(false);
  });
});
