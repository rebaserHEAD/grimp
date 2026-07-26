import { describe, it, expect, vi } from 'vitest';
import { FileSystemResourceProvider } from '../resourceProvider';

describe('FileSystemResourceProvider', () => {
  function makeFile(content: string, name: string = 'test.txt'): File {
    return new File([content], name, { type: 'text/plain' });
  }

  it('listFiles filters by directory and extension', async () => {
    const files = new Map<string, File>([
      ['Prototypes/Tiles/floors.yml', makeFile('', 'floors.yml')],
      ['Prototypes/Tiles/walls.yml', makeFile('', 'walls.yml')],
      ['Prototypes/Entities/mobs.yml', makeFile('', 'mobs.yml')],
      ['Textures/Structures/apc.rsi/meta.json', makeFile('', 'meta.json')],
    ]);
    const provider = new FileSystemResourceProvider(files, 'TestFork');
    const result = await provider.listFiles('Prototypes/Tiles', '.yml');
    expect(result).toEqual(['/Prototypes/Tiles/floors.yml', '/Prototypes/Tiles/walls.yml']);
  });

  it('readText reads file content', async () => {
    const files = new Map<string, File>([['Prototypes/Tiles/floors.yml', makeFile('tile: FloorSteel', 'floors.yml')]]);
    const provider = new FileSystemResourceProvider(files, 'TestFork');
    const text = await provider.readText('/Prototypes/Tiles/floors.yml');
    expect(text).toBe('tile: FloorSteel');
  });

  it('readText throws for missing file', async () => {
    const provider = new FileSystemResourceProvider(new Map(), 'TestFork');
    await expect(provider.readText('/missing.yml')).rejects.toThrow('File not found');
  });

  it('getImageUrl returns empty string for missing file', () => {
    const provider = new FileSystemResourceProvider(new Map(), 'TestFork');
    const url = provider.getImageUrl('/missing/image.png');
    expect(url).toBe('');
  });

  it('getImageUrl creates blob URL', async () => {
    const files = new Map<string, File>([
      ['Textures/icon.png', new File([new Uint8Array([0x89, 0x50])], 'icon.png', { type: 'image/png' })],
    ]);
    const provider = new FileSystemResourceProvider(files, 'TestFork');
    const url = await provider.getImageUrl('/Textures/icon.png');
    expect(url).toMatch(/^blob:/);
    provider.dispose();
  });

  it('dispose revokes all blob URLs', async () => {
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL');
    const files = new Map<string, File>([
      ['Textures/a.png', new File([new Uint8Array([1])], 'a.png', { type: 'image/png' })],
      ['Textures/b.png', new File([new Uint8Array([2])], 'b.png', { type: 'image/png' })],
    ]);
    const provider = new FileSystemResourceProvider(files, 'TestFork');
    await provider.getImageUrl('/Textures/a.png');
    await provider.getImageUrl('/Textures/b.png');
    provider.dispose();
    expect(revokeSpy).toHaveBeenCalledTimes(2);
    revokeSpy.mockRestore();
  });

  it('forkName returns configured name', () => {
    const provider = new FileSystemResourceProvider(new Map(), 'MyFork');
    expect(provider.forkName).toBe('MyFork');
  });

  it('isLocal is true', () => {
    const provider = new FileSystemResourceProvider(new Map(), 'TestFork');
    expect(provider.isLocal).toBe(true);
  });

  it('listFiles returns empty for non-matching directory', async () => {
    const files = new Map<string, File>([['Prototypes/Entities/mobs.yml', makeFile('', 'mobs.yml')]]);
    const provider = new FileSystemResourceProvider(files, 'TestFork');
    const result = await provider.listFiles('Prototypes/Tiles', '.yml');
    expect(result).toEqual([]);
  });
});
