import { describe, it, expect } from 'vitest';
import { parsePrototypeYaml } from '../prototypeDiscovery';

const TILE_YAML = `
- type: tile
  id: FloorSteel
  name: tiles-steel-floor
  sprite: /Textures/Tiles/steel.png
  variants: 4
  baseTurf: Plating
  isSubfloor: false
- type: tile
  id: Plating
  name: tiles-plating
  sprite: /Textures/Tiles/plating.png
  isSubfloor: true
`;

const ENTITY_YAML = `
- type: entity
  id: BaseAPC
  parent: BaseWallmount
  abstract: true
  components:
  - type: Sprite
    sprite: Structures/Power/apc.rsi
    layers:
    - state: base
    - state: panel
      visible: false
- type: entity
  id: APCBasic
  parent: BaseAPC
  name: APC
  suffix: "Basic, 50kJ"
`;

describe('parsePrototypeYaml', () => {
  it('parses tile prototypes', () => {
    const result = parsePrototypeYaml(TILE_YAML, '/Prototypes/Tiles/floors.yml');
    expect(result.tiles).toHaveLength(2);
    expect(result.tiles[0].id).toBe('FloorSteel');
    expect(result.tiles[0].sprite).toBe('/Textures/Tiles/steel.png');
    expect(result.tiles[0].variants).toBe(4);
    expect(result.tiles[0].isSubfloor).toBe(false);
    expect(result.tiles[1].id).toBe('Plating');
    expect(result.tiles[1].isSubfloor).toBe(true);
  });

  it('parses entity prototypes', () => {
    const result = parsePrototypeYaml(ENTITY_YAML, '/Prototypes/Entities/Structures/Power/apc.yml');
    expect(result.entities).toHaveLength(2);
    expect(result.entities[0].id).toBe('BaseAPC');
    expect(result.entities[0].parent).toBe('BaseWallmount');
    expect(result.entities[0].abstract).toBe(true);
    expect(result.entities[1].id).toBe('APCBasic');
    expect(result.entities[1].parent).toBe('BaseAPC');
  });

  it('extracts source category from file path', () => {
    const result = parsePrototypeYaml(ENTITY_YAML, '/Prototypes/Entities/Structures/Power/apc.yml');
    expect(result.sourceCategory).toBe('Structures/Power');
  });

  it('ignores non-tile non-entity entries', () => {
    const yaml = `
- type: reagent
  id: Water
  name: water
`;
    const result = parsePrototypeYaml(yaml, '/Prototypes/Reagents/chemicals.yml');
    expect(result.tiles).toHaveLength(0);
    expect(result.entities).toHaveLength(0);
  });
});
