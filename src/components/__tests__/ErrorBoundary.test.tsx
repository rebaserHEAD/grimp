import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { ErrorBoundary } from '../ErrorBoundary';

function Bomb(): React.ReactElement {
  throw new Error('kaboom: bad prototype');
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    // React logs caught render errors loudly; keep test output readable.
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders children when nothing throws', () => {
    render(
      <ErrorBoundary>
        <div>editor alive</div>
      </ErrorBoundary>,
    );
    expect(screen.getByText('editor alive')).toBeTruthy();
  });

  it('catches a render crash and shows the message with a reload action', () => {
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    );
    expect(screen.getByText(/GRIMP hit a rock/)).toBeTruthy();
    expect(screen.getByText(/kaboom: bad prototype/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Reload editor/ })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Report a bug/ })).toBeTruthy();
  });
});
