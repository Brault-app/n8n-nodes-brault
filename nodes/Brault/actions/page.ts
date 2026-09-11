import { bodyParam, folderLocator, libraryLocator, pathLocator, queryParam } from '../catalogue/common-params';
import type { ResourceSpec } from '../catalogue/types';
import { deleteWithTrash } from './delete-with-trash';

const pageIdParam = pathLocator('pageId', 'Page', 'page');

export const page: ResourceSpec = {
	value: 'page',
	name: 'Page',
	description: 'Documents with rich-text blocks stored inside a library or folder',
	operations: [
		{
			resource: 'page',
			operation: 'getAll',
			name: 'Get Many',
			action: 'Get many pages',
			description: 'List pages in a library or folder',
			method: 'GET',
			plane: 'regional',
			path: '/v1/pages',
			list: true,
			fields: [
				{ ...libraryLocator(), in: 'query' },
				{ ...folderLocator(), in: 'query' },
				queryParam('recursive', 'Recursive', 'boolean', {
					description: 'Whether to include pages nested under the folder',
				}),
			],
		},
		{
			resource: 'page',
			operation: 'get',
			name: 'Get',
			action: 'Get a page',
			description: 'Retrieve one page by ID',
			method: 'GET',
			plane: 'regional',
			path: '/v1/pages/{pageId}',
			params: [pageIdParam],
			fields: [
				queryParam('format', 'Format', 'options', {
					default: 'json',
					description: 'Format to return the page content in',
					options: [
						{ name: 'JSON', value: 'json' },
						{ name: 'Markdown', value: 'markdown' },
					],
				}),
			],
		},
		{
			resource: 'page',
			operation: 'create',
			name: 'Create',
			action: 'Create a page',
			description: 'Create a page in a library or folder',
			method: 'POST',
			plane: 'regional',
			path: '/v1/pages',
			params: [bodyParam('name', 'Name', 'string', { required: true, placeholder: 'e.g. Style Guide' })],
			fields: [
				libraryLocator(),
				folderLocator(),
				bodyParam('to_root', 'To Root', 'boolean', { description: 'Whether to create the page at the brandspace root (All Files)' }),
				bodyParam('blocks', 'Blocks', 'json', {
					description: 'Array of blocks: { type, text, level, items, language }',
				}),
			],
		},
		{
			resource: 'page',
			operation: 'delete',
			name: 'Delete',
			action: 'Delete a page',
			description: 'Delete a page, or permanently remove it from the trash',
			method: 'DELETE',
			plane: 'regional',
			path: '/v1/pages/{pageId}',
			params: [pageIdParam],
			fields: [queryParam('permanent', 'Permanent', 'boolean', { description: 'Whether to delete permanently instead of moving to trash' })],
			custom: deleteWithTrash,
		},
		{
			resource: 'page',
			operation: 'publish',
			name: 'Publish',
			action: 'Publish a page',
			description: 'Publish a page so it can be viewed through a shared link',
			method: 'POST',
			plane: 'regional',
			path: '/v1/pages/{pageId}/publish',
			params: [pageIdParam],
		},
		{
			resource: 'page',
			operation: 'unpublish',
			name: 'Unpublish',
			action: 'Unpublish a page',
			description: 'Unpublish a page, removing it from any shared link that shows it',
			method: 'POST',
			plane: 'regional',
			path: '/v1/pages/{pageId}/unpublish',
			params: [pageIdParam],
		},
		{
			resource: 'page',
			operation: 'appendBlocks',
			name: 'Append Blocks',
			action: 'Append blocks to a page',
			description: 'Append one or more blocks to the end of a page',
			method: 'POST',
			plane: 'regional',
			path: '/v1/pages/{pageId}/blocks',
			params: [
				pageIdParam,
				bodyParam('blocks', 'Blocks', 'json', {
					required: true,
					description: 'Array of blocks: { type, text, level, items, language }',
				}),
			],
		},
	],
};
