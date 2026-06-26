import { describe, it, expect } from 'vitest';
import { buildFileMapFromFileList, validateRepository, summarizeRepository } from '../directoryScanner';

function makeFile(name: string, content: string = ''): File {
  return new File([content], name);
}

describe('buildFileMapFromFileList', () => {
  it('filters to Resources/ subtree', async () => {
    const files: File[] = [];
    const addFile = (path: string) => {
      const f = makeFile(path.split('/').pop()!);
      Object.defineProperty(f, 'webkitRelativePath', { value: `repo/${path}` });
      files.push(f);
    };
    addFile('Resources/Prototypes/Tiles/floors.yml');
    addFile('Resources/Textures/Structures/apc.rsi/meta.json');
    addFile('Content.Server/Program.cs');

    const map = await buildFileMapFromFileList(files);
    expect(map.size).toBe(2);
    expect(map.has('Prototypes/Tiles/floors.yml')).toBe(true);
    expect(map.has('Textures/Structures/apc.rsi/meta.json')).toBe(true);
  });

  it('handles Resources/ as root folder', async () => {
    const files: File[] = [];
    const f = makeFile('floors.yml');
    Object.defineProperty(f, 'webkitRelativePath', { value: 'Resources/Prototypes/Tiles/floors.yml' });
    files.push(f);

    const map = await buildFileMapFromFileList(files);
    expect(map.has('Prototypes/Tiles/floors.yml')).toBe(true);
  });
});

describe('validateRepository', () => {
  it('returns valid for repo with Prototypes/', () => {
    const map = new Map([['Prototypes/Tiles/floors.yml', makeFile('data')]]);
    expect(validateRepository(map).valid).toBe(true);
  });

  it('returns invalid for empty map', () => {
    const result = validateRepository(new Map());
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('returns invalid when no Prototypes/ files', () => {
    const map = new Map([['Textures/test.png', makeFile('data')]]);
    expect(validateRepository(map).valid).toBe(false);
  });
});

describe('summarizeRepository', () => {
  it('counts files by category', () => {
    const map = new Map([
      ['Prototypes/Tiles/floors.yml', makeFile('')],
      ['Prototypes/Tiles/plating.yml', makeFile('')],
      ['Prototypes/Entities/walls.yml', makeFile('')],
      ['Prototypes/Entities/doors.yml', makeFile('')],
      ['Prototypes/Entities/machines.yml', makeFile('')],
      ['Prototypes/Decals/bot.yml', makeFile('')],
      ['Prototypes/Catalog/fills.yml', makeFile('')],
      ['Prototypes/_ExampleFork/Entities/custom.yml', makeFile('')],
    ]);
    const summary = summarizeRepository(map);
    expect(summary.tileFiles).toBe(2);
    expect(summary.entityFiles).toBe(4);
    expect(summary.decalFiles).toBe(1);
    expect(summary.catalogFiles).toBe(1);
    expect(summary.forkDirs).toContain('_ExampleFork');
    expect(summary.totalFiles).toBe(8);
  });
});
