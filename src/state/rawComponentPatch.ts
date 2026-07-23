/**
 * Surgical edits to a structural entity's raw component lines.
 *
 * Imported files keep each structural entity's YAML verbatim
 * (ImportedMap.entityRawComponents) so exports round-trip byte-exact.
 * Property edits (grid name/desc, ship components) must therefore patch
 * those raw lines directly: touching only the targeted component block
 * keeps parity for every other line in the file.
 *
 * Line shape (as captured by the importer):
 *   `    - type: X`   component boundary, 4-space indent
 *   `      field: v`  top-level component field, 6-space indent
 *   deeper indents    nested values, never touched by this module
 */
import { formatPrimitive } from '../export/mapExporter';

const COMPONENT_RE = /^ {4}- type: (.+?)\s*$/;
const FIELD_INDENT = '      ';

export function findComponentBlock(
  rawLines: string[],
  type: string,
): { start: number; end: number } | null {
  for (let i = 0; i < rawLines.length; i++) {
    const m = COMPONENT_RE.exec(rawLines[i]);
    if (!m || m[1] !== type) continue;
    let end = i + 1;
    while (end < rawLines.length && !COMPONENT_RE.test(rawLines[end])) end++;
    return { start: i, end };
  }
  return null;
}

export function hasComponent(rawLines: string[], type: string): boolean {
  return findComponentBlock(rawLines, type) !== null;
}

/**
 * Set (or remove, when value is null) a scalar field on a component,
 * creating the component block at the end when it does not exist.
 * New fields insert alphabetically among top-level fields, matching the
 * engine serializer's field order.
 */
export function setComponentField(
  rawLines: string[],
  type: string,
  field: string,
  value: string | null,
): string[] {
  const out = [...rawLines];
  let block = findComponentBlock(out, type);
  if (!block) {
    if (value === null) return out;
    out.push(`    - type: ${type}`);
    block = { start: out.length - 1, end: out.length };
  }

  const fieldRe = new RegExp(`^ {6}${field}:`);
  for (let i = block.start + 1; i < block.end; i++) {
    if (!fieldRe.test(out[i])) continue;
    // A deeper-indented continuation means the field is not a scalar;
    // replacing its first line alone would corrupt the value. Fail loud.
    const next = out[i + 1];
    if (next !== undefined && /^ {7,}/.test(next) && i + 1 < block.end) {
      throw new Error(`Field ${type}.${field} is not a scalar; refusing to patch raw YAML`);
    }
    if (value === null) {
      out.splice(i, 1);
    } else {
      out[i] = `${FIELD_INDENT}${field}: ${formatPrimitive(value)}`;
    }
    return out;
  }

  if (value === null) return out;

  // Insert alphabetically among existing top-level fields.
  let insertAt = block.end;
  for (let i = block.start + 1; i < block.end; i++) {
    const m = /^ {6}(\w+):/.exec(out[i]);
    if (!m) continue;
    if (field < m[1]) {
      insertAt = i;
      break;
    }
  }
  out.splice(insertAt, 0, `${FIELD_INDENT}${field}: ${formatPrimitive(value)}`);
  return out;
}

/** Append a bare component block; no-op when it already exists. */
export function addComponent(rawLines: string[], type: string): string[] {
  if (hasComponent(rawLines, type)) return [...rawLines];
  return [...rawLines, `    - type: ${type}`];
}

/** Remove a component block entirely; no-op when it is missing. */
export function removeComponent(rawLines: string[], type: string): string[] {
  const block = findComponentBlock(rawLines, type);
  if (!block) return [...rawLines];
  const out = [...rawLines];
  out.splice(block.start, block.end - block.start);
  return out;
}
