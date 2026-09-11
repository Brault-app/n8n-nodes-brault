import type { ParamSpec } from './types';

/**
 * The default value `build-properties.ts` would compute for a bare param of this type:
 * `''` for string/dateTime/json (and locator params, which are always typed `string`
 * here), `false` for boolean, `0` for number, `[]` for multiOptions, and for `options`
 * the first option's value. Factories below call this so every `ParamSpec` literal
 * carries an explicit `default`, matching what the rendered node property gets anyway.
 */
export function defaultForType(type: ParamSpec['type'], options?: ParamSpec['options']): unknown {
	switch (type) {
		case 'boolean':
			return false;
		case 'number':
			return 0;
		case 'multiOptions':
			return [];
		case 'options':
			return options?.[0]?.value ?? '';
		default:
			return '';
	}
}

/** Library that holds the item; body param by default, override `in` for query use. */
export const libraryLocator = (required = false): ParamSpec => ({
	displayName: 'Library',
	name: 'library_id',
	in: 'body',
	type: 'string',
	required,
	default: '',
	locator: 'library',
	description: 'Library that holds the item',
});

/** Folder inside the library; body param by default, override `in` for query use. */
export const folderLocator = (required = false): ParamSpec => ({
	displayName: 'Folder',
	name: 'folder_id',
	in: 'body',
	type: 'string',
	required,
	default: '',
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
	default: '',
	locator,
});

export const queryParam = (
	name: string,
	displayName: string,
	type: ParamSpec['type'] = 'string',
	extra: Partial<ParamSpec> = {},
): ParamSpec => ({ name, displayName, in: 'query', type, default: defaultForType(type, extra.options), ...extra });

export const bodyParam = (
	name: string,
	displayName: string,
	type: ParamSpec['type'] = 'string',
	extra: Partial<ParamSpec> = {},
): ParamSpec => ({ name, displayName, in: 'body', type, default: defaultForType(type, extra.options), ...extra });
