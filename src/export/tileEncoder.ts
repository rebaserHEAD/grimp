/**
 * Binary tile chunk encoding for SS14 map format.
 *
 * SS14 maps use 16x16 tile chunks. Tile encoding depends on format version:
 *
 * Format 6 (6 bytes per tile):
 *   - int32 LE  tileId
 *   - byte      flags    (0)
 *   - byte      variant  (0)
 *   = 1536 bytes per chunk
 *
 * Format 7 (7 bytes per tile):
 *   - int32 LE  tileId
 *   - byte      flags    (0)
 *   - uint16 LE variant  (0)
 *   = 1792 bytes per chunk
 */

const CHUNK_SIZE = 16;
const TILES_PER_CHUNK = CHUNK_SIZE * CHUNK_SIZE;
const BYTES_PER_TILE_V6 = 6;
const BYTES_PER_TILE_V7 = 7;

export function encodeTileChunk(tileIds: number[], format: number = 6): string {
  if (tileIds.length !== TILES_PER_CHUNK) {
    throw new Error(`Expected ${TILES_PER_CHUNK} tiles, got ${tileIds.length}`);
  }
  const bytesPerTile = format >= 7 ? BYTES_PER_TILE_V7 : BYTES_PER_TILE_V6;
  const buf = new ArrayBuffer(TILES_PER_CHUNK * bytesPerTile);
  const view = new DataView(buf);
  for (let i = 0; i < TILES_PER_CHUNK; i++) {
    const offset = i * bytesPerTile;
    view.setInt32(offset, tileIds[i], true);
    view.setUint8(offset + 4, 0);
    if (format >= 7) {
      view.setUint16(offset + 5, 0, true); // uint16 LE variant
    } else {
      view.setUint8(offset + 5, 0); // byte variant
    }
  }
  return uint8ArrayToBase64(new Uint8Array(buf));
}

export function chunkKey(gx: number, gy: number): string {
  return `${Math.floor(gx / CHUNK_SIZE)},${Math.floor(gy / CHUNK_SIZE)}`;
}

export function localIndex(gx: number, gy: number): number {
  const lx = ((gx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
  const ly = ((gy % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
  return ly * CHUNK_SIZE + lx;
}

export { CHUNK_SIZE, TILES_PER_CHUNK };

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
