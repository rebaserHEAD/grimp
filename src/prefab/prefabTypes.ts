/** A sparse tile entry, only non-Space tiles are stored. */
export interface PrefabTile {
  dx: number;
  dy: number;
  tileId: string;
}

/** An entity stored relative to the prefab's top-left corner. */
export interface PrefabEntity {
  dx: number;
  dy: number;
  prototype: string;
  rotation: number;
  components: Record<string, unknown>[];
  /** Verbatim YAML lines for byte-exact export roundtrip. */
  rawYamlLines?: string[];
  /** Editor-only RSI state override for visual rendering. */
  spriteStateOverride?: string;
}

/** A device link between two entities, referenced by index in the entities array. */
export interface PrefabDeviceLink {
  sourceIdx: number;
  targetIdx: number;
  port: string;
  sink: string;
}

/** The complete prefab file format (serialized as `.prefab.json`). */
export interface PrefabData {
  name: string;
  width: number;
  height: number;
  tiles: PrefabTile[];
  entities: PrefabEntity[];
  deviceLinks: PrefabDeviceLink[];
}
