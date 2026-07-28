import { z } from 'zod';

/**
 * Structural shell of an SS14 map/grid document.
 *
 * This is deliberately the THINNEST schema that still guarantees what the
 * importer's traversal assumes: without it, a non-map YAML (a prototype file,
 * a lobby screen, half a merge conflict) surfaces as a cryptic TypeError
 * three calls deep. With it, the status bar says what's actually missing.
 *
 * It is NOT a semantic validator. Fields are only type-checked when present,
 * unknown keys pass through untouched, and component bodies stay opaque:
 * players hand-edit these files and the round-trip contract is byte-exact,
 * so anything this schema rejected would become an unopenable file. When in
 * doubt, stay loose.
 */

/** A component entry: any mapping. `type` is checked where the code dispatches on it. */
const componentSchema = z.record(z.string(), z.unknown());

const rawEntitySchema = z.looseObject({
  uid: z.int(),
  components: z.array(componentSchema).nullish(),
});

const entityGroupSchema = z.looseObject({
  // Structural (map/grid) groups carry proto: '' or no proto at all.
  proto: z.string().nullish(),
  entities: z.array(rawEntitySchema).nullish(),
});

const mapDocumentSchema = z.looseObject({
  // meta/tilemap are absence-tolerant downstream (parseMeta defaults format
  // to 6, parseTilemap returns {}), so they stay optional here too.
  meta: z.record(z.string(), z.unknown()).nullish(),
  tilemap: z.record(z.string(), z.unknown()).nullish(),
  entities: z.array(entityGroupSchema),
});

export type MapDocument = z.infer<typeof mapDocumentSchema>;

/**
 * Validate a parsed YAML document as a map/grid file.
 * Throws an Error whose message is short enough for the status bar.
 */
export function validateMapDocument(doc: unknown): MapDocument {
  const result = mapDocumentSchema.safeParse(doc);
  if (!result.success) {
    const issues = result.error.issues
      .slice(0, 3)
      .map((i) => (i.path.length > 0 ? `${i.path.join('.')}: ${i.message}` : i.message))
      .join('; ');
    throw new Error(`Not a valid map/grid file (${issues})`);
  }
  return result.data;
}
