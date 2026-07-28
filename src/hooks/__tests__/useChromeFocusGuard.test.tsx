import { describe, it, expect } from 'vitest';
import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import { useChromeFocusGuard, isClickActivatedChrome } from '../useChromeFocusGuard';

/**
 * The browser leaves keyboard focus on a clicked control; a desktop app does
 * not. The guard blurs click-activated chrome after the click so shortcuts
 * keep working (the field report: toggle a layer checkbox, then Space toggles
 * the checkbox instead of panning and tool keybinds go dead).
 *
 * jsdom does not move focus on click the way a browser does, so each case
 * focuses the control explicitly and then clicks: exactly the post-click
 * state a real browser is left in.
 */

function Harness() {
  useChromeFocusGuard();
  return (
    <div>
      <label>
        Layer
        <input type="checkbox" data-testid="checkbox" />
      </label>
      <button data-testid="button">Tool</button>
      <input type="text" data-testid="text" />
      <select data-testid="select">
        <option>one</option>
      </select>
    </div>
  );
}

describe('useChromeFocusGuard', () => {
  it('releases focus from a clicked checkbox', () => {
    const { getByTestId } = render(<Harness />);
    const checkbox = getByTestId('checkbox');
    checkbox.focus();
    fireEvent.click(checkbox);
    expect(document.activeElement).not.toBe(checkbox);
  });

  it('releases focus from a clicked button', () => {
    const { getByTestId } = render(<Harness />);
    const button = getByTestId('button');
    button.focus();
    fireEvent.click(button);
    expect(document.activeElement).not.toBe(button);
  });

  it('leaves text inputs focused: typing there is the point', () => {
    const { getByTestId } = render(<Harness />);
    const text = getByTestId('text');
    text.focus();
    fireEvent.click(text);
    expect(document.activeElement).toBe(text);
  });

  it('leaves selects focused: blurring one closes its dropdown', () => {
    const { getByTestId } = render(<Harness />);
    const select = getByTestId('select');
    select.focus();
    fireEvent.click(select);
    expect(document.activeElement).toBe(select);
  });

  it('lets a click handler that focuses something else win', () => {
    // The search bar's clear button refocuses the search input during its
    // click handler; the guard must not blur the input it moved focus to.
    function Refocus() {
      useChromeFocusGuard();
      const inputRef = React.useRef<HTMLInputElement>(null);
      return (
        <div>
          <button data-testid="clear" onClick={() => inputRef.current?.focus()}>
            Clear
          </button>
          <input type="text" data-testid="search" ref={inputRef} />
        </div>
      );
    }
    const { getByTestId } = render(<Refocus />);
    const clear = getByTestId('clear');
    clear.focus();
    fireEvent.click(clear);
    expect(document.activeElement).toBe(getByTestId('search'));
  });

  it('stops listening after unmount', () => {
    const { unmount } = render(<Harness />);
    unmount();
    // With the guard gone, a clicked control keeps focus again.
    const straggler = document.createElement('button');
    document.body.appendChild(straggler);
    straggler.focus();
    fireEvent.click(straggler);
    expect(document.activeElement).toBe(straggler);
    straggler.remove();
  });
});

describe('isClickActivatedChrome', () => {
  it.each([
    ['checkbox', true],
    ['radio', true],
    ['button', true],
    ['submit', true],
    ['file', true],
    ['text', false],
    ['number', false],
    ['search', false],
    ['range', false],
    ['color', false],
  ])('input[type=%s] -> %s', (type, expected) => {
    const input = document.createElement('input');
    input.type = type as string;
    expect(isClickActivatedChrome(input)).toBe(expected);
  });

  it('classifies buttons and links as chrome, selects and textareas not', () => {
    expect(isClickActivatedChrome(document.createElement('button'))).toBe(true);
    expect(isClickActivatedChrome(document.createElement('a'))).toBe(true);
    expect(isClickActivatedChrome(document.createElement('select'))).toBe(false);
    expect(isClickActivatedChrome(document.createElement('textarea'))).toBe(false);
    expect(isClickActivatedChrome(null)).toBe(false);
  });
});
