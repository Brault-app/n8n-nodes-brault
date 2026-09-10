/*
 * Catalogue data, not n8n INodeProperties: these ParamSpec objects only share the
 * displayName/name/type shape. catalogue/build-properties.ts turns them into real node
 * properties and always emits a `default` there.
 */
/* eslint-disable n8n-nodes-base/node-param-default-missing */
import type { ParamSpec } from './types';

/** Library that holds the item; body param by default, override `in` for query use. */
export const libraryLocator = (required = false): ParamSpec => ({
	name: 'library_id',
	displayName: 'Library',
	in: 'body',
	type: 'string',
	required,
	locator: 'library',
	description: 'Library that holds the item',
});

/** Folder inside the library; body param by default, override `in` for query use. */
export const folderLocator = (required = false): ParamSpec => ({
	name: 'folder_id',
	displayName: 'Folder',
	in: 'body',
	type: 'string',
	required,
	locator: 'folder',
	description: 'Folder inside the library',
});

/** A required `{name}` path placeholder rendered as a Resource Locator. */
export const pathLocator = (name: string, displayName: string, locator: ParamSpec['locator']): ParamSpec => ({
	name,
	displayName,
	in: 'path',
	type: 'string',
	required: true,
	locator,
});

export const queryParam = (
	name: string,
	displayName: string,
	type: ParamSpec['type'] = 'string',
	extra: Partial<ParamSpec> = {},
): ParamSpec => ({ name, displayName, in: 'query', type, ...extra });

export const bodyParam = (
	name: string,
	displayName: string,
	type: ParamSpec['type'] = 'string',
	extra: Partial<ParamSpec> = {},
): ParamSpec => ({ name, displayName, in: 'body', type, ...extra });
