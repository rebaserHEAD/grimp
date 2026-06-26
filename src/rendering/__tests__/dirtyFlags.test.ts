import { describe, it, expect, beforeEach } from 'vitest';
import {
  needsRedraw, markClean, markSceneDirty, markCameraDirty,
  markOverlayDirty, markConnectionsDirty, markAllDirty,
  isSceneDirty, isCameraDirty, isOverlayDirty, isConnectionsDirty,
} from '../dirtyFlags';

describe('dirtyFlags', () => {
  beforeEach(() => {
    // Start each test clean
    markClean();
  });

  it('starts clean after markClean', () => {
    expect(needsRedraw()).toBe(false);
  });

  it('markSceneDirty triggers redraw', () => {
    markSceneDirty();
    expect(needsRedraw()).toBe(true);
    expect(isSceneDirty()).toBe(true);
    expect(isCameraDirty()).toBe(false);
  });

  it('markCameraDirty triggers redraw', () => {
    markCameraDirty();
    expect(needsRedraw()).toBe(true);
    expect(isCameraDirty()).toBe(true);
    expect(isSceneDirty()).toBe(false);
  });

  it('markOverlayDirty triggers redraw', () => {
    markOverlayDirty();
    expect(needsRedraw()).toBe(true);
    expect(isOverlayDirty()).toBe(true);
  });

  it('markConnectionsDirty triggers redraw', () => {
    markConnectionsDirty();
    expect(needsRedraw()).toBe(true);
    expect(isConnectionsDirty()).toBe(true);
  });

  it('markAllDirty sets all flags', () => {
    markAllDirty();
    expect(isSceneDirty()).toBe(true);
    expect(isCameraDirty()).toBe(true);
    expect(isOverlayDirty()).toBe(true);
    expect(isConnectionsDirty()).toBe(true);
  });

  it('markClean clears all flags', () => {
    markAllDirty();
    markClean();
    expect(needsRedraw()).toBe(false);
    expect(isSceneDirty()).toBe(false);
    expect(isCameraDirty()).toBe(false);
    expect(isOverlayDirty()).toBe(false);
    expect(isConnectionsDirty()).toBe(false);
  });

  it('multiple flags can be set independently', () => {
    markSceneDirty();
    markCameraDirty();
    expect(isSceneDirty()).toBe(true);
    expect(isCameraDirty()).toBe(true);
    expect(isOverlayDirty()).toBe(false);
  });
});
