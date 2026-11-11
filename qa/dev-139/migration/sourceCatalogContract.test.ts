import assert from 'node:assert/strict';
import test from 'node:test';

import {
  findUnclassifiedSourceRelations,
  type SourceCatalogRelation,
} from '../../../scripts/dev139-data-migration.js';

const relation = (
  schema_name: string,
  relation_name: string,
  relation_kind: string,
  extension_owned = false,
): SourceCatalogRelation => ({ schema_name, relation_name, relation_kind, extension_owned });

test('unknown public and private stored relations fail closed, including partitioned and foreign tables', () => {
  const unknown = findUnclassifiedSourceRelations([
    relation('public', 'empty_unknown_table', 'r'),
    relation('private', 'unknown_partitioned_table', 'p'),
    relation('public', 'unknown_materialized_view', 'm'),
    relation('private', 'unknown_foreign_table', 'f'),
  ], new Set());

  assert.deepEqual(unknown.map(({ schema_name, relation_name }) => `${schema_name}.${relation_name}`), [
    'public.empty_unknown_table',
    'private.unknown_partitioned_table',
    'public.unknown_materialized_view',
    'private.unknown_foreign_table',
  ]);
});

test('classified, extension-owned, non-app-schema, and plain view relations are excluded', () => {
  const unknown = findUnclassifiedSourceRelations([
    relation('public', 'profiles', 'r'),
    relation('public', 'spatial_ref_sys', 'r', true),
    relation('auth', 'users', 'r'),
    relation('storage', 'objects', 'r'),
    relation('public', 'derived_projection', 'v'),
    relation('public', 'still_unknown_materialized_view', 'm'),
  ], new Set(['public.profiles']));

  assert.deepEqual(unknown.map(({ schema_name, relation_name }) => `${schema_name}.${relation_name}`), [
    'public.still_unknown_materialized_view',
  ]);
});
