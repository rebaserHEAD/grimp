import type { ImportedEntity } from '../../import/mapImporter';

export interface ComponentEditorProps {
  component: Record<string, unknown>;
  onChange: (updated: Record<string, unknown>) => void;
  allEntities?: ImportedEntity[];
}
