import React from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Last-resort catch for render-phase crashes. Any fork's data can reach the
 * renderer (weird prototypes, hand-edited maps), and before this existed a
 * single throw during render whitescreened the editor with nothing but the
 * devtools console to explain it, taking unsaved work down with it.
 *
 * Recovery is a reload: render-phase state is gone, but the reload path goes
 * back through the fork selector's recent-files list, which is the closest
 * thing to "pick up where you left off" a dead tree can offer.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('GRIMP crashed during render:', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="w-screen h-screen flex items-center justify-center bg-[#1a1a1a] text-[#ddd]">
        <div className="max-w-[560px] mx-4 p-6 rounded-lg border border-[#444] bg-[#242424]">
          <h1 className="text-lg font-bold mb-2 text-[#e66]">GRIMP hit a rock</h1>
          <p className="text-sm mb-3">
            The editor crashed while rendering. This is a bug worth reporting, especially if you can say what you
            clicked right before it happened.
          </p>
          <pre className="text-xs bg-[#1a1a1a] border border-[#333] rounded p-2 mb-3 overflow-auto max-h-[200px] whitespace-pre-wrap">
            {this.state.error.message}
            {'\n'}
            {this.state.error.stack?.split('\n').slice(1, 6).join('\n')}
          </pre>
          <div className="flex gap-2">
            <button
              onClick={() => window.location.reload()}
              className="px-3 py-1.5 rounded bg-[#2a5a2a] border border-[#3a7a3a] text-[#cfc] text-sm cursor-pointer"
            >
              Reload editor
            </button>
            <a
              href="https://github.com/rebaserHEAD/grimp/issues"
              target="_blank"
              rel="noreferrer"
              className="px-3 py-1.5 rounded bg-[#333] border border-[#555] text-[#ccc] text-sm no-underline"
            >
              Report a bug
            </a>
          </div>
        </div>
      </div>
    );
  }
}
