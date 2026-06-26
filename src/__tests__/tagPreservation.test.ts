/// <reference types="node" />
import { describe, it, expect } from 'vitest';
import { resolve } from 'path';
import { importMap } from '../import/mapImporter';
import { exportMap } from '../export/mapExporter';
import { pickMap } from '../test-utils/realMaps';

// Maps are discovered from the host repo's Resources/Maps (see test-utils/realMaps).
const MAPS_DIR = resolve(__dirname, '../../../../Resources/Maps');

describe('YAML type tag preservation', () => {
  // Pick the first importable map that actually uses YAML !type: tags.
  const yamlContent = pickMap(MAPS_DIR, importMap, { yamlIncludes: '!type:' })?.yaml ?? '';
  const skip = yamlContent.length === 0;

  it('original file contains !type: tags', () => {
    if (skip) return;
    const typeTagMatches = yamlContent.match(/!type:/g);
    expect(typeTagMatches).not.toBeNull();
    expect(typeTagMatches!.length).toBeGreaterThan(0);
    console.log(`Original file has ${typeTagMatches!.length} !type: tags`);
  });

  it('imported map preserves _ss14Tag on components', () => {
    if (skip) return;
    const map = importMap(yamlContent);

    // Check regular entities
    let tagCount = 0;
    for (const entity of map.entities) {
      for (const comp of entity.components) {
        tagCount += countTags(comp);
      }
    }
    console.log(`Entity component tags: ${tagCount}`);

    // Check structural entities
    let structTagCount = 0;
    if (map.structuralEntityData) {
      for (const comps of Object.values(map.structuralEntityData)) {
        for (const comp of comps) {
          structTagCount += countTags(comp);
        }
      }
    }
    console.log(`Structural component tags: ${structTagCount}`);

    const totalTags = tagCount + structTagCount;
    console.log(`Total tags found in imported data: ${totalTags}`);
    expect(totalTags).toBeGreaterThan(0);
  });

  it('exported YAML preserves !type: tags', () => {
    if (skip) return;
    const map = importMap(yamlContent);
    const exported = exportMap(map);

    const origTagCount = (yamlContent.match(/!type:/g) ?? []).length;
    const exportedTagCount = (exported.match(/!type:/g) ?? []).length;

    console.log(`Original !type: tags: ${origTagCount}`);
    console.log(`Exported !type: tags: ${exportedTagCount}`);

    // Show lines with !type: in exported
    const tagLines = exported.split('\n').filter(l => l.includes('!type:'));
    console.log('Exported lines with !type::', tagLines.length);
    tagLines.forEach(l => console.log('  ', l.trim()));

    // Also show lines where we'd expect tags
    const containerLines = exported.split('\n').filter(l =>
      l.includes('entity_storage:') || l.includes('storagebase:') ||
      l.includes('paper_label:') || l.includes('machine_board:') ||
      l.includes('charger_slot:') || l.includes('machine_parts:')
    );
    console.log('Container-related lines:', containerLines.length);
    containerLines.forEach(l => console.log('  ', l.trim()));

    expect(exportedTagCount).toBe(origTagCount);
  });
});

function countTags(obj: unknown): number {
  if (obj === null || obj === undefined || typeof obj !== 'object') return 0;
  if (Array.isArray(obj)) return obj.reduce((sum, item) => sum + countTags(item), 0);
  const record = obj as Record<string, unknown>;
  let count = record._ss14Tag ? 1 : 0;
  for (const [k, v] of Object.entries(record)) {
    if (k !== '_ss14Tag') count += countTags(v);
  }
  return count;
}
