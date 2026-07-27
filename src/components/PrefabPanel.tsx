import React, { useRef, useState, useCallback, useEffect } from 'react';
import type { PrefabData } from '../prefab/prefabTypes';
import { parsePrefabJson, PREFABS_CHANGED_EVENT } from '../prefab/prefabIO';

interface LoadedPrefab {
  data: PrefabData;
  filename: string;
  folder: string;
}

interface Props {
  onSelectPrefab: (prefab: PrefabData) => void;
}

const prefabsBridge = typeof window !== 'undefined' ? window.electronPrefabs : undefined;
const hasLibrary = !!prefabsBridge?.available;

export const PrefabPanel: React.FC<Props> = ({ onSelectPrefab }) => {
  const [prefabs, setPrefabs] = useState<LoadedPrefab[]>([]);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /**
   * Load prefabs: the userData library over IPC on desktop (#45), plus the
   * dev-server endpoint / build manifest for bundled examples.
   */
  const loadPrefabs = useCallback(async () => {
    setLoading(true);
    try {
      const loaded: LoadedPrefab[] = [];

      // Desktop: the user's prefab library (rendered at the root level).
      if (prefabsBridge?.available) {
        for (const file of await prefabsBridge.list()) {
          try {
            loaded.push({ data: parsePrefabJson(file.content), filename: file.fileName, folder: '' });
          } catch (err) {
            console.warn(`Skipping ${file.fileName}:`, err);
          }
        }
      }

      // Bundled prefabs: dev server endpoint first, then build-time manifest.
      let entries: { path: string; folder: string }[] | null = null;
      try {
        const listRes = await fetch('/__api/prefabs');
        if (listRes.ok) {
          entries = await listRes.json();
        }
      } catch {
        // Dev endpoint not available
      }
      if (!entries) {
        try {
          const manifestRes = await fetch('/prefabs-manifest.json');
          if (manifestRes.ok) {
            entries = await manifestRes.json();
          }
        } catch {
          // No manifest either
        }
      }
      for (const entry of entries ?? []) {
        try {
          const fileRes = await fetch(entry.path);
          if (!fileRes.ok) continue;
          const data = parsePrefabJson(await fileRes.text());
          const filename = entry.path.split('/').pop() || entry.path;
          loaded.push({ data, filename, folder: entry.folder });
        } catch (err) {
          console.warn(`Skipping ${entry.path}:`, err);
        }
      }

      setPrefabs((prev) => {
        // Browser only: keep session-imported prefabs (folder === '') across
        // refreshes. On desktop the library IS the root; imports live there.
        const sessionLocal = hasLibrary ? [] : prev.filter((p) => p.folder === '');
        return [...loaded, ...sessionLocal];
      });
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-load on mount, and reload whenever the library changes (e.g. the
  // select tool's Save as Prefab writing into it).
  useEffect(() => {
    loadPrefabs();
    window.addEventListener(PREFABS_CHANGED_EVENT, loadPrefabs);
    return () => window.removeEventListener(PREFABS_CHANGED_EVENT, loadPrefabs);
  }, [loadPrefabs]);

  const handleImportClick = useCallback(async () => {
    if (prefabsBridge?.available) {
      const imported = await prefabsBridge.importFiles();
      if (imported.length > 0) await loadPrefabs();
      return;
    }
    fileInputRef.current?.click();
  }, [loadPrefabs]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    file.text().then((json) => {
      try {
        const data = parsePrefabJson(json);
        setPrefabs((prev) => {
          const filtered = prev.filter((p) => !(p.filename === file.name && p.folder === ''));
          return [...filtered, { data, filename: file.name, folder: '' }];
        });
      } catch (err) {
        console.error('Failed to parse prefab:', err);
      }
    });
    e.target.value = '';
  }, []);

  const handleSelect = useCallback(
    (prefab: LoadedPrefab) => {
      setSelectedName(prefab.data.name);
      onSelectPrefab(prefab.data);
    },
    [onSelectPrefab],
  );

  const toggleFolder = useCallback((folder: string) => {
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folder)) next.delete(folder);
      else next.add(folder);
      return next;
    });
  }, []);

  // Group prefabs by folder
  const folders = new Map<string, LoadedPrefab[]>();
  for (const p of prefabs) {
    const key = p.folder || '';
    if (!folders.has(key)) folders.set(key, []);
    folders.get(key)!.push(p);
  }
  // Sort folders: root ('') first, then alphabetical
  const sortedFolders = [...folders.keys()].sort((a, b) => {
    if (a === '') return -1;
    if (b === '') return 1;
    return a.localeCompare(b);
  });

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Toolbar */}
      <div className="flex gap-1 p-2 border-b border-subtle">
        <button
          className="px-2 py-1 bg-elevated border border-subtle rounded-sm text-primary text-xs cursor-pointer hover:bg-hover"
          onClick={handleImportClick}
          title={hasLibrary ? 'Import prefabs into your library' : 'Import prefab .json file'}
        >
          +
        </button>
        <button
          className="px-2 py-1 bg-elevated border border-subtle rounded-sm text-primary text-xs cursor-pointer hover:bg-hover"
          onClick={loadPrefabs}
          title={hasLibrary ? 'Refresh prefab library' : 'Refresh from public/prefabs/'}
        >
          {loading ? '...' : '\u21BB'}
        </button>
        {hasLibrary && (
          <button
            className="px-2 py-1 bg-elevated border border-subtle rounded-sm text-primary text-xs cursor-pointer hover:bg-hover ml-auto"
            onClick={() => void prefabsBridge!.openFolder()}
            title="Open the prefabs folder"
          >
            &#128193;
          </button>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".prefab.json,.json"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Prefab list grouped by folder */}
      <div className="flex-1 overflow-y-auto">
        {prefabs.length === 0 && !loading ? (
          <div className="text-muted text-xs p-3 italic text-center leading-relaxed">
            {hasLibrary ? (
              <>
                No prefabs yet.
                <br />
                Select a region and use
                <br />
                <span className="text-primary">Save as Prefab</span>, or import with +
              </>
            ) : (
              <>
                No prefabs found.
                <br />
                Save .prefab.json files to
                <br />
                <span className="text-primary">public/prefabs/</span>
              </>
            )}
          </div>
        ) : loading ? (
          <div className="text-muted text-xs p-3 italic text-center">Loading...</div>
        ) : (
          sortedFolders.map((folder) => {
            const items = folders.get(folder)!;
            const isCollapsed = collapsedFolders.has(folder);

            return (
              <div key={folder || '__root'}>
                {/* Folder header (skip for root-level prefabs) */}
                {folder !== '' && (
                  <div
                    onClick={() => toggleFolder(folder)}
                    className="flex items-center gap-1 px-2 py-1 cursor-pointer bg-surface border-b border-subtle text-[11px] text-muted select-none"
                  >
                    <span className="text-[8px]">{isCollapsed ? '\u25B6' : '\u25BC'}</span>
                    {folder}
                    <span className="text-muted ml-auto">{items.length}</span>
                  </div>
                )}

                {/* Prefab entries */}
                {!isCollapsed &&
                  items.map((p, i) => (
                    <div
                      key={`${p.folder}/${p.filename}-${i}`}
                      onClick={() => handleSelect(p)}
                      className={`px-3 py-1 text-xs cursor-pointer border-b border-subtle ${folder ? 'pl-4' : ''} ${
                        selectedName === p.data.name ? 'bg-active' : 'hover:bg-hover'
                      }`}
                    >
                      <div className="text-primary text-xs">{p.data.name}</div>
                      <div className="text-muted text-[10px]">
                        {p.data.width}&times;{p.data.height}
                      </div>
                    </div>
                  ))}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
