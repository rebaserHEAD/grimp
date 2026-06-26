/**
 * Custom js-yaml schema for SS14 YAML files.
 *
 * SS14 uses custom YAML tags like !type:SoundPathSpecifier, !type:Color, etc.
 * This schema treats all !type:* tags as pass-through values, preserving the
 * data structure while allowing js-yaml to parse without errors.
 */

import yaml from 'js-yaml';

const MULTI_TYPE_MAPPING = new yaml.Type('!type:', {
  kind: 'mapping',
  multi: true,
  represent(data: any) { return data; },
  construct(data: any, type?: string) {
    if (data !== null && typeof data === 'object') {
      data._ss14Tag = type;
    }
    return data;
  },
});

const MULTI_TYPE_SCALAR = new yaml.Type('!type:', {
  kind: 'scalar',
  multi: true,
  represent(data: any) { return String(data); },
  construct(data: any, type?: string) {
    return { _ss14Tag: type, value: data };
  },
});

const MULTI_TYPE_SEQUENCE = new yaml.Type('!type:', {
  kind: 'sequence',
  multi: true,
  represent(data: any) { return data; },
  construct(data: any, type?: string) {
    return { _ss14Tag: type, items: data };
  },
});

export const SS14_SCHEMA = yaml.DEFAULT_SCHEMA.extend([
  MULTI_TYPE_MAPPING,
  MULTI_TYPE_SCALAR,
  MULTI_TYPE_SEQUENCE,
]);
