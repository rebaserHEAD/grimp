import type { IPrototypeRegistry } from './registryTypes';
import { loadRsiMeta } from './rsiLoader';

/**
 * Get all available RSI state names for an entity prototype.
 * Returns empty array if the entity has no sprite or loading fails.
 */
export async function getAvailableStates(
  prototype: string,
  registry: IPrototypeRegistry,
): Promise<string[]> {
  const spriteInfo = registry.getSpriteInfo(prototype);
  if (!spriteInfo) return [];

  try {
    const meta = await loadRsiMeta(spriteInfo.rsiPath);
    return Array.from(meta.states.keys());
  } catch {
    return [];
  }
}
