/*
 * Catalogue data, not n8n INodeProperties: these ParamSpec objects only share the
 * displayName/name/type shape. catalogue/build-properties.ts turns them into real node
 * properties and always emits a `default` there.
 */
/* eslint-disable n8n-nodes-base/node-param-default-missing */
import { bodyParam, folderLocator, libraryLocator, pathLocator, queryParam } from '../catalogue/common-params';
import type { ResourceSpec } from '../catalogue/types';

export const folder: ResourceSpec = {
	value: 'folder',
	name: 'Folder',
	description: 'Organizes files inside a library',
	operations: [
		{
			resource: 'folder',
			operation: 'getAll',
			name: 'Get Many',
			action: 'Get many folders',
			description: 'List folders in a library or under a parent folder',
			method: 'GET',
			plane: 'regional',
			path: '/v1/folders',
			list: true,
			fields: [
				{ ...libraryLocator(), in: 'query' },
				{ ...folderLocator(), in: 'query', displayName: 'Parent Folder' },
				queryParam('recursive', 'Recursive', 'boolean', {
					description: 'Whether to include folders nested under the parent folder',
				}),
			],
		},
		{
			resource: 'folder',
			operation: 'get',
			name: 'Get',
			action: 'Get a folder',
			description: 'Retrieve one folder by ID',
			method: 'GET',
			plane: 'regional',
			path: '/v1/folders/{folderId}',
			params: [pathLocator('folderId', 'Folder', 'folder')],
		},
		{
			resource: 'folder',
			operation: 'create',
			name: 'Create',
			action: 'Create a folder',
			description: 'Create a folder at the library root or under a parent folder',
			method: 'POST',
			plane: 'regional',
			path: '/v1/folders',
			params: [bodyParam('name', 'Name', 'string', { required: true, placeholder: 'e.g. Campaign assets' })],
			fields: [libraryLocator(), { ...folderLocator(), displayName: 'Parent Folder' }],
		},
		{
			resource: 'folder',
			operation: 'update',
			name: 'Update',
			action: 'Update a folder',
			description: 'Rename a folder or change its color',
			method: 'PATCH',
			plane: 'regional',
			path: '/v1/folders/{folderId}',
			params: [pathLocator('folderId', 'Folder', 'folder')],
			fields: [
				bodyParam('name', 'Name', 'string'),
				bodyParam('color', 'Color', 'string', { placeholder: 'e.g. #FF5A1F' }),
			],
		},
		{
			resource: 'folder',
			operation: 'move',
			name: 'Move',
			action: 'Move a folder',
			description: 'Move a folder to another library or parent folder',
			method: 'POST',
			plane: 'regional',
			path: '/v1/folders/{folderId}/move',
			params: [pathLocator('folderId', 'Folder', 'folder')],
			fields: [libraryLocator(), { ...folderLocator(), displayName: 'Destination Folder' }],
		},
		{
			resource: 'folder',
			operation: 'delete',
			name: 'Delete',
			action: 'Delete a folder',
			description: 'Move a folder to the trash, or delete it permanently',
			method: 'DELETE',
			plane: 'regional',
			path: '/v1/folders/{folderId}',
			params: [pathLocator('folderId', 'Folder', 'folder')],
			fields: [
				queryParam('permanent', 'Permanent', 'boolean', {
					description: 'Delete permanently instead of moving to trash',
				}),
			],
		},
		{
			resource: 'folder',
			operation: 'restore',
			name: 'Restore',
			action: 'Restore a folder',
			description: 'Restore a folder that was moved to the trash',
			method: 'POST',
			plane: 'regional',
			path: '/v1/folders/{folderId}/restore',
			params: [pathLocator('folderId', 'Folder', 'folder')],
		},
	],
};
