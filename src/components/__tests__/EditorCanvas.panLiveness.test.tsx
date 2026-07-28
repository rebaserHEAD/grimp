import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { fireEvent } from '@testing-library/dom';
import { EditorCanvas } from '../EditorCanvas';
import { Camera } from '../../rendering/camera';
import { createInitialState } from '../../state/editorState';
import { DEFAULT_LAYER_VISIBILITY } from '../../rendering/entityRenderer';
import { DEFAULT_DECAL_PLACEMENT_SETTINGS } from '../DecalPalette';
import type { ITool } from '../../tools/toolTypes';

/**
 * Regression cover for the stuck-pan selection desync.
 *
 * The pan/drag state machine used to trust that every mousedown gets a matching
 * mouseup. Releases can be eaten (outside the window, native autoscroll, menus),
 * after which `isPanning` stayed true with NO button held: every bare mousemove
 * kept panning the camera, the world tracked the cursor back toward where the
 * pan started, and the next click hit-tested against a camera position the user
 * never chose. Symptom in the field: "middle-click pan, click something else,
 * selection lands on a random spot and the view snaps back to the previous pan
 * location."
 *
 * The fix reads `e.buttons` (ground truth for what is held right now) on every
 * mousemove and closes out any drag state whose release was missed, before
 * acting on it. These tests simulate the eaten release directly by never firing
 * mouseup and moving with `buttons: 0`.
 */

// TILE_SIZE is 32 and the test camera stays at zoom 1, so 32 screen px = 1 tile.
const TILE = 32;

function makeTool(overrides: Partial<ITool> = {}): ITool {
  return {
    name: 'entitySelect',
    cursor: 'default',
    onMouseDown: vi.fn(),
    onMouseMove: vi.fn(),
    onMouseUp: vi.fn(),
    ...overrides,
  } as unknown as ITool;
}

function setup(tool: ITool | null = null) {
  const camera = new Camera();
  const state = createInitialState();
  const { container } = render(
    <EditorCanvas
      state={state}
      dispatch={vi.fn()}
      camera={camera}
      activeTool={tool}
      showEntities={false}
      showGrid={false}
      showSpaceBackground={false}
      isSpaceHeld={false}
      isRHeld={false}
      showSubFloor={false}
      layerVisibility={DEFAULT_LAYER_VISIBILITY}
      showConnections={false}
      lightingEnabled={false}
      decalPlacementSettingsRef={{ current: { ...DEFAULT_DECAL_PLACEMENT_SETTINGS } }}
    />,
  );
  const canvas = container.querySelector('canvas');
  if (!canvas) throw new Error('EditorCanvas rendered no canvas element');
  return { camera, canvas };
}

beforeEach(() => {
  // The component pans via deltas between events, so absolute coordinates only
  // need to be self-consistent within a test.
});

describe('EditorCanvas pan liveness', () => {
  it('pans normally while the middle button is genuinely held', () => {
    const { camera, canvas } = setup();

    fireEvent.mouseDown(canvas, { button: 1, buttons: 4, clientX: 400, clientY: 300 });
    fireEvent.mouseMove(canvas, { buttons: 4, clientX: 400 - TILE, clientY: 300 });

    // Dragging left by one tile moves the camera right by one tile (world follows cursor).
    expect(camera.x).toBeCloseTo(1);
    expect(camera.y).toBeCloseTo(0);

    fireEvent.mouseUp(canvas, { button: 1, buttons: 0, clientX: 400 - TILE, clientY: 300 });
    fireEvent.mouseMove(canvas, { buttons: 0, clientX: 400, clientY: 300 });

    // After a real release, bare movement must not pan.
    expect(camera.x).toBeCloseTo(1);
  });

  it('stops panning on the first bare mousemove when the middle release was eaten', () => {
    const { camera, canvas } = setup();

    fireEvent.mouseDown(canvas, { button: 1, buttons: 4, clientX: 400, clientY: 300 });
    fireEvent.mouseMove(canvas, { buttons: 4, clientX: 400 - TILE, clientY: 300 });
    expect(camera.x).toBeCloseTo(1);

    // No mouseup: the release was eaten. The user now moves the bare cursor back
    // toward something they want to click.
    fireEvent.mouseMove(canvas, { buttons: 0, clientX: 400, clientY: 300 });
    fireEvent.mouseMove(canvas, { buttons: 0, clientX: 400 + 3 * TILE, clientY: 300 - 2 * TILE });

    // Before the fix these moves kept panning (camera.x would walk back toward 0
    // and past it). The camera must stay exactly where the real pan left it.
    expect(camera.x).toBeCloseTo(1);
    expect(camera.y).toBeCloseTo(0);
  });

  it('leaves the next click usable after healing a stuck pan', () => {
    const tool = makeTool();
    const { camera, canvas } = setup(tool);

    fireEvent.mouseDown(canvas, { button: 1, buttons: 4, clientX: 400, clientY: 300 });
    fireEvent.mouseMove(canvas, { buttons: 4, clientX: 336, clientY: 300 });
    // Eaten release, then the user travels to a new target.
    fireEvent.mouseMove(canvas, { buttons: 0, clientX: 200, clientY: 200 });
    const xAfterHeal = camera.x;

    // The click must go to the tool, not be swallowed by pan state, and must not
    // move the camera.
    fireEvent.mouseDown(canvas, { button: 0, buttons: 1, clientX: 200, clientY: 200 });
    fireEvent.mouseUp(canvas, { button: 0, buttons: 0, clientX: 200, clientY: 200 });

    expect(tool.onMouseDown).toHaveBeenCalledTimes(1);
    expect(tool.onMouseUp).toHaveBeenCalledTimes(1);
    expect(camera.x).toBeCloseTo(xAfterHeal);
  });

  it('closes out a tool drag whose release was eaten', () => {
    const tool = makeTool();
    const { canvas } = setup(tool);

    fireEvent.mouseDown(canvas, { button: 0, buttons: 1, clientX: 100, clientY: 100 });
    expect(tool.onMouseDown).toHaveBeenCalledTimes(1);

    // Release eaten; bare movement afterward must deliver exactly one synthetic
    // mouseup so the tool's drag state (box select, move drag) cannot stay open.
    fireEvent.mouseMove(canvas, { buttons: 0, clientX: 150, clientY: 150 });
    expect(tool.onMouseUp).toHaveBeenCalledTimes(1);

    // Further hovering must not fabricate more mouseups.
    fireEvent.mouseMove(canvas, { buttons: 0, clientX: 180, clientY: 180 });
    fireEvent.mouseMove(canvas, { buttons: 0, clientX: 220, clientY: 140 });
    expect(tool.onMouseUp).toHaveBeenCalledTimes(1);
  });

  it('does not fabricate a mouseup while a tool drag is genuinely held', () => {
    const tool = makeTool();
    const { canvas } = setup(tool);

    fireEvent.mouseDown(canvas, { button: 0, buttons: 1, clientX: 100, clientY: 100 });
    fireEvent.mouseMove(canvas, { buttons: 1, clientX: 150, clientY: 150 });
    fireEvent.mouseMove(canvas, { buttons: 1, clientX: 200, clientY: 200 });

    expect(tool.onMouseUp).not.toHaveBeenCalled();
    expect(tool.onMouseMove).toHaveBeenCalled();

    fireEvent.mouseUp(canvas, { button: 0, buttons: 0, clientX: 200, clientY: 200 });
    expect(tool.onMouseUp).toHaveBeenCalledTimes(1);
  });

  it('a real mouseup still reaches the tool exactly once', () => {
    const tool = makeTool();
    const { canvas } = setup(tool);

    fireEvent.mouseDown(canvas, { button: 0, buttons: 1, clientX: 100, clientY: 100 });
    fireEvent.mouseUp(canvas, { button: 0, buttons: 0, clientX: 100, clientY: 100 });
    fireEvent.mouseMove(canvas, { buttons: 0, clientX: 160, clientY: 160 });

    expect(tool.onMouseUp).toHaveBeenCalledTimes(1);
  });
});
