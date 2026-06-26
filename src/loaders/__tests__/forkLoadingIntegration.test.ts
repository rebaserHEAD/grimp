import { describe, it, expect, afterEach } from 'vitest';
import { FileSystemResourceProvider, HttpResourceProvider, setActiveProvider } from '../resourceProvider';
import { initRegistry } from '../initRegistry';
import { validateRepository, summarizeRepository } from '../directoryScanner';

function makeYaml(content: string): File {
  return new File([content], 'test.yml', { type: 'text/yaml' });
}

describe('fork loading integration', () => {
  afterEach(() => {
    setActiveProvider(null);
  });

  it('loads prototypes from FileSystemResourceProvider end-to-end', async () => {
    const files = new Map<string, File>([
      ['Prototypes/Tiles/floors.yml', makeYaml([
        '- type: tile',
        '  id: FloorSteel',
        '  name: Steel Floor',
        '  baseTurf: Space',
      ].join('\n'))],
      ['Prototypes/Entities/structures.yml', makeYaml([
        '- type: entity',
        '  id: WallSolid',
        '  name: Wall',
        '  components:',
        '  - type: Transform',
      ].join('\n'))],
      ['Prototypes/Decals/bot.yml', makeYaml([
        '- type: decal',
        '  id: BotGreyscale',
        '  defaultCustomColor: true',
      ].join('\n'))],
    ]);

    const provider = new FileSystemResourceProvider(files, 'TestFork');

    // Validate
    const validation = validateRepository(files);
    expect(validation.valid).toBe(true);

    // Summarize
    const summary = summarizeRepository(files);
    expect(summary.tileFiles).toBe(1);
    expect(summary.entityFiles).toBe(1);
    expect(summary.decalFiles).toBe(1);
    expect(summary.totalFiles).toBe(3);

    // Load registry
    setActiveProvider(provider);
    const registry = await initRegistry(provider);
    expect(registry.tileCount).toBeGreaterThanOrEqual(1);
    expect(registry.entityCount).toBeGreaterThanOrEqual(1);
    expect(registry.getTile('FloorSteel')).toBeDefined();
    expect(registry.getEntity('WallSolid')).toBeDefined();

    provider.dispose();
  });

  it('HttpResourceProvider backward compatibility (string overload)', async () => {
    // Verify string overload constructs HttpResourceProvider internally
    const provider = new HttpResourceProvider('');
    expect(provider.forkName).toBe('Built-in');
    expect(provider.isLocal).toBe(false);
  });

  it('validates invalid repository', () => {
    const empty = new Map<string, File>();
    expect(validateRepository(empty).valid).toBe(false);

    const noProtos = new Map([['Textures/test.png', makeYaml('')]]);
    expect(validateRepository(noProtos).valid).toBe(false);
  });

  it('summarizes fork directories', () => {
    const files = new Map<string, File>([
      ['Prototypes/Entities/walls.yml', makeYaml('')],
      ['Prototypes/_ExampleFork/Entities/custom.yml', makeYaml('')],
      ['Prototypes/_OtherFork/Tiles/floors.yml', makeYaml('')],
    ]);
    const summary = summarizeRepository(files);
    expect(summary.forkDirs).toContain('_ExampleFork');
    expect(summary.forkDirs).toContain('_OtherFork');
  });
});
