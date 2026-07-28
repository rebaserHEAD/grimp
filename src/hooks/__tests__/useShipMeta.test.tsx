import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useShipMeta } from '../useShipMeta';
import type { ResourceProvider } from '../../loaders/resourceProvider';

/**
 * Laziness and caching contract for the ship-meta cross-reference:
 * the Prototypes/ scan is expensive, so it must not run until there is a
 * file to look up, must run at most once per fork load, and must not leak
 * a stale index across a fork switch.
 */
const VESSEL_YAML = `
- type: vessel
  id: Adjutant
  shuttlePath: /Maps/_Triad/Shuttles/TDF/adjutant.yml
`;

function fakeProvider(files: Record<string, string>, name = 'TestFork') {
  const listFiles = vi.fn(async () => Object.keys(files));
  const provider: ResourceProvider = {
    listFiles,
    readText: async (path: string) => {
      const text = files[path];
      if (text === undefined) throw new Error(`missing ${path}`);
      return text;
    },
    getImageUrl: () => '',
    forkName: name,
    dispose: () => {},
  };
  return { provider, listFiles };
}

const FORK = 'C:/src/Triad_Sector';
const ADJUTANT = 'C:/src/Triad_Sector/Resources/Maps/_Triad/Shuttles/TDF/adjutant.yml';
const UNREFERENCED = 'C:/src/Triad_Sector/Resources/Maps/other.yml';
const PROTO_FILES = { '/Prototypes/_Triad/Shipyard/TDF/adjutant.yml': VESSEL_YAML };

describe('useShipMeta', () => {
  it('does not scan while no file with a path is open', () => {
    const { provider, listFiles } = fakeProvider(PROTO_FILES);
    const { result } = renderHook(() => useShipMeta(provider, FORK, null));
    expect(listFiles).not.toHaveBeenCalled();
    expect(result.current.hits).toEqual([]);
  });

  it('does not scan in the browser build, where there is no fork dir', () => {
    const { provider, listFiles } = fakeProvider(PROTO_FILES);
    renderHook(() => useShipMeta(provider, null, ADJUTANT));
    expect(listFiles).not.toHaveBeenCalled();
  });

  it('scans once a file is open and resolves its referencing prototypes', async () => {
    const { provider, listFiles } = fakeProvider(PROTO_FILES);
    const { result, rerender } = renderHook(({ path }) => useShipMeta(provider, FORK, path), {
      initialProps: { path: null as string | null },
    });
    expect(result.current.hits).toEqual([]);
    expect(listFiles).not.toHaveBeenCalled();

    // Open the file: scan kicks off, hits arrive when it settles.
    rerender({ path: ADJUTANT });
    await waitFor(() => expect(result.current.hits).toHaveLength(1));
    expect(result.current.hits[0]).toMatchObject({ kind: 'vessel', id: 'Adjutant' });
  });

  it('scans at most once per fork, across file switches', async () => {
    const { provider, listFiles } = fakeProvider(PROTO_FILES);
    const { result, rerender } = renderHook(({ path }) => useShipMeta(provider, FORK, path), {
      initialProps: { path: ADJUTANT as string | null },
    });
    await waitFor(() => expect(result.current.hits).toHaveLength(1));

    rerender({ path: UNREFERENCED });
    await waitFor(() => expect(result.current.hits).toEqual([]));
    rerender({ path: ADJUTANT });
    await waitFor(() => expect(result.current.hits).toHaveLength(1));

    expect(listFiles).toHaveBeenCalledTimes(1);
  });

  it('a file switch landing mid-scan still resolves against the same single scan', async () => {
    // Hold the scan open until both file switches have happened.
    let releaseListing: (files: string[]) => void = () => {};
    const gate = new Promise<string[]>((resolve) => {
      releaseListing = resolve;
    });
    const listFiles = vi.fn(() => gate);
    const provider: ResourceProvider = {
      listFiles,
      readText: async (path: string) => PROTO_FILES[path as keyof typeof PROTO_FILES] ?? '',
      getImageUrl: () => '',
      forkName: 'TestFork',
      dispose: () => {},
    };

    const { result, rerender } = renderHook(({ path }) => useShipMeta(provider, FORK, path), {
      initialProps: { path: UNREFERENCED as string | null },
    });
    rerender({ path: ADJUTANT }); // switch files while the scan is still listing

    releaseListing(Object.keys(PROTO_FILES));
    await waitFor(() => expect(result.current.hits).toHaveLength(1));
    expect(listFiles).toHaveBeenCalledTimes(1);
  });

  it('drops the index on fork switch and resolves against the new fork', async () => {
    const forkA = fakeProvider(PROTO_FILES, 'ForkA');
    // Same map path, but in fork B nothing references it.
    const forkB = fakeProvider({ '/Prototypes/empty.yml': '- type: entity\n  id: X\n' }, 'ForkB');

    const { result, rerender } = renderHook(({ provider }) => useShipMeta(provider, FORK, ADJUTANT), {
      initialProps: { provider: forkA.provider },
    });
    await waitFor(() => expect(result.current.hits).toHaveLength(1));

    rerender({ provider: forkB.provider });
    await waitFor(() => expect(result.current.hits).toEqual([]));
    expect(forkB.listFiles).toHaveBeenCalledTimes(1);
  });

  it('clears everything when the fork unloads', async () => {
    const { provider } = fakeProvider(PROTO_FILES);
    const { result, rerender } = renderHook(
      ({ provider: p }: { provider: ResourceProvider | null }) => useShipMeta(p, FORK, ADJUTANT),
      { initialProps: { provider: provider as ResourceProvider | null } },
    );
    await waitFor(() => expect(result.current.hits).toHaveLength(1));

    rerender({ provider: null });
    expect(result.current.hits).toEqual([]);
  });
});
