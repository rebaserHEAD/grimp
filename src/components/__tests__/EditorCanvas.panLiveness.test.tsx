import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { fireEvent } from '@testing-library/dom';
import { EditorCanvas } from '../EditorCanvas';
import { Camera } from '../../rendering/camera';
import { createInitialState } from '../../state/editorState';
import { DEFAULT_LAYER_VISIBILITY } from '../../rendering/entityRenderer';
import { DEFAULT_DECAL_PLACEMENT_SETTINGS } from '../DecalPalette';
import type { ITool } from '../../tools/toolTypes';

/**
 * Gesture integrity for the canvas input stack.
 *
 * The stack is pointer-events + setPointerCapture: a gesture that starts on
 * the canvas owns the pointer until release or cancel, so moves and the
 * release reach the canvas no matter where the cursor goes. On top of capture
 * sit three invariants these tests pin:
 *
 * 1. LIVENESS: `e.buttons` is ground truth. If a move arrives with no buttons
 *    held while drag state is live (capture failed, synthetic events), the
 *    stale gesture is closed out before anything acts on it. This killed the
 *    field desync "middle-click pan, click something else, selection lands on
 *    a random spot and the view snaps back."
 * 2. PAIRING: tools only ever see onMouseUp for a drag the canvas started.
 *    Unpaired releases (down on a panel, gesture already healed or cancelled)
 *    never reach the tool: tools treat onMouseUp as click/commit, so a
 *    phantom one selects or drops at a spot the user never clicked.
 * 3. ONE GESTURE AT A TIME: while a pan or tool drag is live, further downs
 *    are ignored: a second pointer must not move the camera under an active
 *    drag's anchor.
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

describe('pointer capture', () => {
  it('requests capture when a gesture starts', () => {
    const { canvas } = setup(makeTool());
    const captureSpy = vi.fn();
    canvas.setPointerCapture = captureSpy;

    fireEvent.pointerDown(canvas, { pointerId: 7, button: 0, buttons: 1, clientX: 100, clientY: 100 });
    expect(captureSpy).toHaveBeenCalledWith(7);
  });

  it('requests capture for a middle-button pan too', () => {
    const { canvas } = setup();
    const captureSpy = vi.fn();
    canvas.setPointerCapture = captureSpy;

    fireEvent.pointerDown(canvas, { pointerId: 3, button: 1, buttons: 4, clientX: 400, clientY: 300 });
    expect(captureSpy).toHaveBeenCalledWith(3);
  });

  it('survives setPointerCapture throwing (dead pointerId, jsdom)', () => {
    const { camera, canvas } = setup();
    canvas.setPointerCapture = () => {
      throw new DOMException('InvalidPointerId');
    };

    fireEvent.pointerDown(canvas, { button: 1, buttons: 4, clientX: 400, clientY: 300 });
    fireEvent.pointerMove(canvas, { buttons: 4, clientX: 400 - TILE, clientY: 300 });
    // The gesture still works without capture; liveness backstops it.
    expect(camera.x).toBeCloseTo(1);
  });
});

describe('pan liveness', () => {
  it('pans normally while the middle button is genuinely held', () => {
    const { camera, canvas } = setup();

    fireEvent.pointerDown(canvas, { button: 1, buttons: 4, clientX: 400, clientY: 300 });
    fireEvent.pointerMove(canvas, { buttons: 4, clientX: 400 - TILE, clientY: 300 });

    // Dragging left by one tile moves the camera right by one tile (world follows cursor).
    expect(camera.x).toBeCloseTo(1);
    expect(camera.y).toBeCloseTo(0);

    fireEvent.pointerUp(canvas, { button: 1, buttons: 0, clientX: 400 - TILE, clientY: 300 });
    fireEvent.pointerMove(canvas, { buttons: 0, clientX: 400, clientY: 300 });

    // After a real release, bare movement must not pan.
    expect(camera.x).toBeCloseTo(1);
  });

  it('stops panning on the first bare move when the release was eaten', () => {
    const { camera, canvas } = setup();

    fireEvent.pointerDown(canvas, { button: 1, buttons: 4, clientX: 400, clientY: 300 });
    fireEvent.pointerMove(canvas, { buttons: 4, clientX: 400 - TILE, clientY: 300 });
    expect(camera.x).toBeCloseTo(1);

    // No pointerup: the release was eaten. The user now moves the bare cursor
    // back toward something they want to click.
    fireEvent.pointerMove(canvas, { buttons: 0, clientX: 400, clientY: 300 });
    fireEvent.pointerMove(canvas, { buttons: 0, clientX: 400 + 3 * TILE, clientY: 300 - 2 * TILE });

    // The camera must stay exactly where the real pan left it.
    expect(camera.x).toBeCloseTo(1);
    expect(camera.y).toBeCloseTo(0);
  });

  it('leaves the next click usable after healing a stuck pan', () => {
    const tool = makeTool();
    const { camera, canvas } = setup(tool);

    fireEvent.pointerDown(canvas, { button: 1, buttons: 4, clientX: 400, clientY: 300 });
    fireEvent.pointerMove(canvas, { buttons: 4, clientX: 336, clientY: 300 });
    // Eaten release, then the user travels to a new target.
    fireEvent.pointerMove(canvas, { buttons: 0, clientX: 200, clientY: 200 });
    const xAfterHeal = camera.x;

    // The click must go to the tool, not be swallowed by pan state, and must
    // not move the camera.
    fireEvent.pointerDown(canvas, { button: 0, buttons: 1, clientX: 200, clientY: 200 });
    fireEvent.pointerUp(canvas, { button: 0, buttons: 0, clientX: 200, clientY: 200 });

    expect(tool.onMouseDown).toHaveBeenCalledTimes(1);
    expect(tool.onMouseUp).toHaveBeenCalledTimes(1);
    expect(camera.x).toBeCloseTo(xAfterHeal);
  });

  it('ends the pan on pointercancel', () => {
    const { camera, canvas } = setup();

    fireEvent.pointerDown(canvas, { button: 1, buttons: 4, clientX: 400, clientY: 300 });
    fireEvent.pointerMove(canvas, { buttons: 4, clientX: 400 - TILE, clientY: 300 });
    expect(camera.x).toBeCloseTo(1);

    fireEvent.pointerCancel(canvas, { clientX: 400 - TILE, clientY: 300 });
    // A move that still claims a held button must not resurrect the pan: the
    // gesture is over.
    fireEvent.pointerMove(canvas, { buttons: 4, clientX: 400, clientY: 300 });
    expect(camera.x).toBeCloseTo(1);
  });
});

describe('tool drag pairing', () => {
  it('closes out a tool drag whose release was eaten', () => {
    const tool = makeTool();
    const { canvas } = setup(tool);

    fireEvent.pointerDown(canvas, { button: 0, buttons: 1, clientX: 100, clientY: 100 });
    expect(tool.onMouseDown).toHaveBeenCalledTimes(1);

    // Release eaten; bare movement afterward must deliver exactly one
    // synthetic mouseup so the tool's drag state cannot stay open.
    fireEvent.pointerMove(canvas, { buttons: 0, clientX: 150, clientY: 150 });
    expect(tool.onMouseUp).toHaveBeenCalledTimes(1);

    // Further hovering must not fabricate more mouseups.
    fireEvent.pointerMove(canvas, { buttons: 0, clientX: 180, clientY: 180 });
    fireEvent.pointerMove(canvas, { buttons: 0, clientX: 220, clientY: 140 });
    expect(tool.onMouseUp).toHaveBeenCalledTimes(1);
  });

  it('does not fabricate a mouseup while a tool drag is genuinely held', () => {
    const tool = makeTool();
    const { canvas } = setup(tool);

    fireEvent.pointerDown(canvas, { button: 0, buttons: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(canvas, { buttons: 1, clientX: 150, clientY: 150 });
    fireEvent.pointerMove(canvas, { buttons: 1, clientX: 200, clientY: 200 });

    expect(tool.onMouseUp).not.toHaveBeenCalled();
    expect(tool.onMouseMove).toHaveBeenCalled();

    fireEvent.pointerUp(canvas, { button: 0, buttons: 0, clientX: 200, clientY: 200 });
    expect(tool.onMouseUp).toHaveBeenCalledTimes(1);
  });

  it('a real release reaches the tool exactly once', () => {
    const tool = makeTool();
    const { canvas } = setup(tool);

    fireEvent.pointerDown(canvas, { button: 0, buttons: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerUp(canvas, { button: 0, buttons: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(canvas, { buttons: 0, clientX: 160, clientY: 160 });

    expect(tool.onMouseUp).toHaveBeenCalledTimes(1);
  });

  it('an unpaired release never reaches the tool', () => {
    const tool = makeTool();
    const { canvas } = setup(tool);

    // Down happened elsewhere (a panel, another window); only the release
    // lands on the canvas. Tools treat onMouseUp as click/commit, so this
    // must not arrive.
    fireEvent.pointerUp(canvas, { button: 0, buttons: 0, clientX: 100, clientY: 100 });
    expect(tool.onMouseUp).not.toHaveBeenCalled();
  });

  it('pointercancel closes the drag exactly once', () => {
    const tool = makeTool();
    const { canvas } = setup(tool);

    fireEvent.pointerDown(canvas, { button: 0, buttons: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerCancel(canvas, { clientX: 140, clientY: 140 });
    expect(tool.onMouseUp).toHaveBeenCalledTimes(1);

    // lostpointercapture follows every cancel (and every normal up); by then
    // the gesture is closed and nothing more may reach the tool.
    fireEvent.lostPointerCapture(canvas, { clientX: 140, clientY: 140 });
    fireEvent.pointerMove(canvas, { buttons: 0, clientX: 180, clientY: 180 });
    expect(tool.onMouseUp).toHaveBeenCalledTimes(1);
    expect(tool.onMouseDown).toHaveBeenCalledTimes(1);
  });
});

describe('one gesture at a time', () => {
  it('ignores a second down while a tool drag is live', () => {
    const tool = makeTool();
    const { camera, canvas } = setup(tool);

    fireEvent.pointerDown(canvas, { button: 0, buttons: 1, clientX: 100, clientY: 100 });
    // A second pointer presses the middle button mid-drag. It must not start
    // a pan: the camera moving would shift the drag's anchor under the tool.
    fireEvent.pointerDown(canvas, { button: 1, buttons: 5, clientX: 200, clientY: 200 });
    fireEvent.pointerMove(canvas, { buttons: 5, clientX: 200 - TILE, clientY: 200 });

    expect(camera.x).toBeCloseTo(0);
    expect(tool.onMouseDown).toHaveBeenCalledTimes(1);
  });

  it('ignores a tool down while a pan is live', () => {
    const tool = makeTool();
    const { canvas } = setup(tool);

    fireEvent.pointerDown(canvas, { button: 1, buttons: 4, clientX: 400, clientY: 300 });
    fireEvent.pointerDown(canvas, { button: 0, buttons: 5, clientX: 400, clientY: 300 });

    expect(tool.onMouseDown).not.toHaveBeenCalled();
  });
});
