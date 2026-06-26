/**
 * Decode a base64-encoded 16x16 tile chunk into an array of 256 tile ID strings.
 * SS14 format: each tile is a uint32 LE representing the tilemap index.
 */
export function decodeChunkTiles(base64: string, tilemap: Record<number, string>): string[] {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  const view = new DataView(bytes.buffer);
  const tiles: string[] = [];

  for (let i = 0; i < 256; i++) {
    const index = view.getUint32(i * 4, true);
    tiles.push(tilemap[index] ?? 'Space');
  }

  return tiles;
}

/**
 * Encode 256 tile ID strings into a base64 chunk.
 */
export function encodeChunkTiles(tileIds: string[], reverseMap: Record<string, number>): string {
  const buf = new ArrayBuffer(256 * 4);
  const view = new DataView(buf);

  for (let i = 0; i < 256; i++) {
    view.setUint32(i * 4, reverseMap[tileIds[i]] ?? 0, true);
  }

  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}
