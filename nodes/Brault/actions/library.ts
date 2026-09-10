/*
 * Catalogue data, not n8n INodeProperties: these ParamSpec objects only share the
 * displayName/name/type shape. catalogue/build-properties.ts turns them into real node
 * properties and always emits a `default` there.
 */
/* eslint-disable n8n-nodes-base/node-param-default-missing */
import type { ResourceSpec } from '../catalogue/types';

export const library: ResourceSpec = {
	value: 'library',
	name: 'Library',
	description: 'Top-level containers of files and folders',
	operations: [
		{
			resource: 'library',
			operation: 'getAll',
			name: 'Get Many',
			action: 'Get many libraries',
			description: 'List the libraries the key can see',
			method: 'GET',
			plane: 'regional',
			path: '/v1/libraries',
			list: true,
		},
		{
			resource: 'library',
			operation: 'get',
			name: 'Get',
			action: 'Get a library',
			description: 'Retrieve one library with its counts',
			method: 'GET',
			plane: 'regional',
			path: '/v1/libraries/{libraryId}',
			params: [
				{ name: 'libraryId', displayName: 'Library', in: 'path', type: 'string', required: true, locator: 'library' },
			],
		},
		{
			resource: 'library',
			operation: 'create',
			name: 'Create',
			action: 'Create a library',
			description: 'Create a new library',
			method: 'POST',
			plane: 'regional',
			path: '/v1/libraries',
			params: [
				{
					name: 'name',
					displayName: 'Name',
					in: 'body',
					type: 'string',
					required: true,
					placeholder: 'e.g. Brand assets',
				},
			],
			fields: [
				{ name: 'description', displayName: 'Description', in: 'body', type: 'string' },
				{ name: 'emoji', displayName: 'Emoji', in: 'body', type: 'string', placeholder: 'e.g. 📁' },
			],
		},
		{
			resource: 'library',
			operation: 'update',
			name: 'Update',
			action: 'Update a library',
			description: 'Rename a library or change its description',
			method: 'PATCH',
			plane: 'regional',
			path: '/v1/libraries/{libraryId}',
			params: [
				{ name: 'libraryId', displayName: 'Library', in: 'path', type: 'string', required: true, locator: 'library' },
			],
			fields: [
				{ name: 'name', displayName: 'Name', in: 'body', type: 'string' },
				{ name: 'description', displayName: 'Description', in: 'body', type: 'string' },
			],
		},
		{
			resource: 'library',
			operation: 'delete',
			name: 'Delete',
			action: 'Delete a library',
			description: 'Delete a library and everything in it',
			method: 'DELETE',
			plane: 'regional',
			path: '/v1/libraries/{libraryId}',
			params: [
				{ name: 'libraryId', displayName: 'Library', in: 'path', type: 'string', required: true, locator: 'library' },
			],
		},
	],
};
