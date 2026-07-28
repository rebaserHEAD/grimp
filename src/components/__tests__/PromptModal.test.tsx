import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PromptModal } from '../PromptModal';

/**
 * First component test in the repo, doubling as the proof that the `dom` project works:
 * JSX compiles, jsdom provides the DOM, effects run, and user events dispatch.
 *
 * PromptModal is a deliberate choice. It replaced window.prompt(), which silently no-ops
 * under Electron (#14), so its whole reason to exist is behavior that only shows up when
 * something drives it.
 */
function setup(props: Partial<React.ComponentProps<typeof PromptModal>> = {}) {
  const onSubmit = vi.fn();
  const onCancel = vi.fn();
  render(<PromptModal title="Name this prefab" onSubmit={onSubmit} onCancel={onCancel} {...props} />);
  return { onSubmit, onCancel, user: userEvent.setup() };
}

describe('PromptModal', () => {
  it('renders the title and focuses the input, so typing lands without a click', () => {
    setup();
    expect(screen.getByText('Name this prefab')).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('textbox'));
  });

  it('seeds the input with defaultValue and selects it for overtyping', () => {
    setup({ defaultValue: 'airlock-block' });
    const input = screen.getByRole('textbox') as HTMLInputElement;
    expect(input.value).toBe('airlock-block');
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe('airlock-block'.length);
  });

  it('submits the typed value', async () => {
    const { onSubmit, user } = setup();
    await user.type(screen.getByRole('textbox'), 'engine-room');
    await user.click(screen.getByRole('button', { name: 'OK' }));
    expect(onSubmit).toHaveBeenCalledWith('engine-room');
  });

  it('submits on Enter', async () => {
    const { onSubmit, user } = setup();
    await user.type(screen.getByRole('textbox'), 'engine-room{Enter}');
    expect(onSubmit).toHaveBeenCalledWith('engine-room');
  });

  it('cancels on Escape', async () => {
    const { onCancel, onSubmit, user } = setup();
    await user.type(screen.getByRole('textbox'), '{Escape}');
    expect(onCancel).toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('cancels on a click outside the dialog but not inside it', async () => {
    const { onCancel, user } = setup({ title: 'Name this prefab' });
    await user.click(screen.getByText('Name this prefab'));
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('trims the submitted value', async () => {
    const { onSubmit, user } = setup();
    await user.type(screen.getByRole('textbox'), '   spaced   {Enter}');
    expect(onSubmit).toHaveBeenCalledWith('spaced');
  });

  it('refuses to submit whitespace only, by keyboard as well as by button', async () => {
    const { onSubmit, user } = setup();
    const input = screen.getByRole('textbox');
    await user.type(input, '   ');
    expect(screen.getByRole('button', { name: 'OK' })).toHaveProperty('disabled', true);
    await user.type(input, '{Enter}');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('honours custom button labels', () => {
    setup({ confirmLabel: 'Save', cancelLabel: 'Discard' });
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Discard' })).toBeTruthy();
  });

  it('shows the optional message only when given one', () => {
    const { onSubmit, onCancel } = { onSubmit: vi.fn(), onCancel: vi.fn() };
    const { rerender } = render(<PromptModal title="T" onSubmit={onSubmit} onCancel={onCancel} />);
    expect(screen.queryByText('Pick something short')).toBeNull();
    rerender(<PromptModal title="T" message="Pick something short" onSubmit={onSubmit} onCancel={onCancel} />);
    expect(screen.getByText('Pick something short')).toBeTruthy();
  });
});
