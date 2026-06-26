import { describe, it, expect } from 'vitest';
import { decodeChunkTiles, encodeChunkTiles } from '../chunkDecoder';

describe('decodeChunkTiles', () => {
  const tilemap: Record<number, string> = { 0: 'Space', 1: 'FloorSteel', 2: 'Plating' };

  it('decodes a chunk with all same tile', () => {
    // Create base64 for 256 tiles all index 0 (Space)
    // Each tile is 4 bytes (uint32 LE): index 0 = 0x00000000
    const buf = new Uint8Array(256 * 4); // all zeros = index 0
    const b64 = btoa(String.fromCharCode(...buf));
    const result = decodeChunkTiles(b64, tilemap);
    expect(result).toHaveLength(256);
    expect(result.every(t => t === 'Space')).toBe(true);
  });

  it('decodes mixed tiles', () => {
    const buf = new Uint8Array(256 * 4);
    const view = new DataView(buf.buffer);
    view.setUint32(0, 1, true);   // tile 0 = FloorSteel
    view.setUint32(4, 2, true);   // tile 1 = Plating
    const b64 = btoa(String.fromCharCode(...buf));
    const result = decodeChunkTiles(b64, tilemap);
    expect(result[0]).toBe('FloorSteel');
    expect(result[1]).toBe('Plating');
    expect(result[2]).toBe('Space');
  });
});

describe('encodeChunkTiles', () => {
  it('roundtrips with decode', () => {
    const tileIds = Array(256).fill('Space');
    tileIds[0] = 'FloorSteel';
    tileIds[15] = 'Plating';
    const reverseMap: Record<string, number> = { 'Space': 0, 'FloorSteel': 1, 'Plating': 2 };
    const tilemap: Record<number, string> = { 0: 'Space', 1: 'FloorSteel', 2: 'Plating' };

    const encoded = encodeChunkTiles(tileIds, reverseMap);
    const decoded = decodeChunkTiles(encoded, tilemap);
    expect(decoded).toEqual(tileIds);
  });
});
