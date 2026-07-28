import { useEffect, useMemo, useRef, useState } from 'react';
import type { ResourceProvider } from '../loaders/resourceProvider';
import type { ShipMetaEntry, ShipMetaIndex } from '../loaders/shipMetaIndex';
import { scanShipMeta, lookupByPath, toResourceRelativePath } from '../loaders/shipMetaIndex';

/**
 * Cross-references the open document against the fork's vessel / gameMap /
 * pointOfInterest / salvageMap prototypes (#3).
 *
 * The scan is a second full pass over Prototypes/ (those types live outside
 * the directories prototype discovery walks), so it is deliberately LAZY:
 * nothing is scanned until a document with a real on-disk path is open under
 * a loaded fork. The scan promise is cached per provider, so the index is
 * built at most once per fork load no matter how often the open file changes,
 * including changes that land mid-scan. A fork switch replaces the cache and
 * drops the stale index.
 *
 * `hits` is empty for new documents and the browser build (no path to look
 * up), and while the scan is still running.
 */
export function useShipMeta(
  provider: ResourceProvider | null,
  forkDir: string | null,
  filePath: string | null,
): { hits: ShipMetaEntry[] } {
  const [index, setIndex] = useState<ShipMetaIndex | null>(null);
  const scanCache = useRef<{ provider: ResourceProvider; promise: Promise<ShipMetaIndex> } | null>(null);

  // The lookup key. Null when there is nothing to cross-reference, which also
  // gates the scan itself.
  const resourcePath = useMemo(() => toResourceRelativePath(forkDir, filePath), [forkDir, filePath]);

  useEffect(() => {
    if (!provider || resourcePath === null) {
      // Fork unloaded: drop the cache so its next load rescans fresh content.
      if (provider === null && scanCache.current !== null) {
        scanCache.current = null;
        setIndex(null);
      }
      return;
    }

    if (scanCache.current?.provider !== provider) {
      // New fork (or first need): kick the scan off once and remember the
      // promise, so effect re-runs re-subscribe instead of re-scanning.
      scanCache.current = { provider, promise: scanShipMeta(provider) };
      setIndex(null);
    }

    let cancelled = false;
    scanCache.current.promise.then((result) => {
      // Stale if the hook unmounted or the fork switched while scanning.
      if (cancelled || scanCache.current?.provider !== provider) return;
      setIndex(result);
    });

    return () => {
      cancelled = true;
    };
  }, [provider, resourcePath]);

  const hits = useMemo(() => {
    if (!index || resourcePath === null) return [];
    return lookupByPath(index, resourcePath);
  }, [index, resourcePath]);

  return { hits };
}
