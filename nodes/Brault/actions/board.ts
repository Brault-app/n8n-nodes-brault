/*
 * Catalogue data, not n8n INodeProperties: these ParamSpec objects only share the
 * displayName/name/type shape. catalogue/build-properties.ts turns them into real node
 * properties and always emits a `default` there.
 */
/* eslint-disable n8n-nodes-base/node-param-default-missing */
import { bodyParam, pathLocator } from '../catalogue/common-params';
import type { ResourceSpec } from '../catalogue/types';
import { setBoardFilePropertyValue, valueParams } from './property-value';

const boardIdParam = pathLocator('boardId', 'Board', 'board');

const DEFAULT_PROPERTY_TYPES = [
	{ name: 'Status', value: 'status' },
	{ name: 'Person', value: 'person' },
	{ name: 'Date', value: 'date' },
	{ name: 'Checkbox', value: 'checkbox' },
	{ name: 'Text', value: 'text' },
	{ name: 'Multi Tag', value: 'multi_tag' },
];

export const board: ResourceSpec = {
	value: 'board',
	name: 'Board',
	description: 'Curated collections of files with per-file property values',
	operations: [
		{
			resource: 'board',
			operation: 'getAll',
			name: 'Get Many',
			action: 'Get many boards',
			description: 'List boards in the brandspace',
			method: 'GET',
			plane: 'regional',
			path: '/v1/boards',
			list: true,
		},
		{
			resource: 'board',
			operation: 'get',
			name: 'Get',
			action: 'Get a board',
			description: 'Retrieve one board by ID',
			method: 'GET',
			plane: 'regional',
			path: '/v1/boards/{boardId}',
			params: [boardIdParam],
		},
		{
			resource: 'board',
			operation: 'create',
			name: 'Create',
			action: 'Create a board',
			description: 'Create a board in the brandspace',
			method: 'POST',
			plane: 'regional',
			path: '/v1/boards',
			params: [bodyParam('name', 'Name', 'string', { required: true, placeholder: 'e.g. Fall Campaign' })],
			fields: [
				bodyParam('default_property_type', 'Default Property Type', 'options', {
					default: 'status',
					description: 'Type assigned to a property created on this board without an explicit type',
					options: DEFAULT_PROPERTY_TYPES,
				}),
			],
		},
		{
			resource: 'board',
			operation: 'update',
			name: 'Update',
			action: 'Update a board',
			description: "Change a board's name, color, emoji, or pinned state",
			method: 'PATCH',
			plane: 'regional',
			path: '/v1/boards/{boardId}',
			params: [boardIdParam],
			fields: [
				bodyParam('name', 'Name', 'string'),
				bodyParam('color', 'Color', 'string'),
				bodyParam('emoji', 'Emoji', 'string'),
				bodyParam('pinned', 'Pinned', 'boolean', { description: 'Whether the board is pinned to the top of the sidebar' }),
			],
		},
		{
			resource: 'board',
			operation: 'delete',
			name: 'Delete',
			action: 'Delete a board',
			description: 'Permanently delete a board',
			method: 'DELETE',
			plane: 'regional',
			path: '/v1/boards/{boardId}',
			params: [boardIdParam],
		},
		{
			resource: 'board',
			operation: 'query',
			name: 'Query',
			action: 'Query files in a board',
			description: 'List the files in a board with their property values, filtered and sorted',
			method: 'POST',
			plane: 'regional',
			path: '/v1/boards/{boardId}/query',
			list: true,
			params: [boardIdParam],
			fields: [
				bodyParam('filter', 'Filter', 'json', {
					description: 'Filter object, see developers.brault.app/docs/reference/boards',
				}),
				bodyParam('q', 'Search Text', 'string'),
				bodyParam('sort', 'Sort', 'options', {
					default: 'manual',
					description: 'Field to sort results by',
					options: [
						{ name: 'Manual', value: 'manual' },
						{ name: 'Added At', value: 'added_at' },
						{ name: 'Gallery', value: 'gallery' },
						{ name: 'Table', value: 'table' },
					],
				}),
				bodyParam('order', 'Order', 'options', {
					default: 'asc',
					description: 'Sort direction',
					options: [
						{ name: 'Ascending', value: 'asc' },
						{ name: 'Descending', value: 'desc' },
					],
				}),
			],
		},
		{
			resource: 'board',
			operation: 'addFiles',
			name: 'Add Files',
			action: 'Add files to a board',
			description: 'Add one or more files to a board',
			method: 'POST',
			plane: 'regional',
			path: '/v1/boards/{boardId}/files',
			params: [
				boardIdParam,
				bodyParam('file_ids', 'File IDs', 'string', { required: true, csv: true, description: 'Comma-separated list of file IDs to add' }),
			],
		},
		{
			resource: 'board',
			operation: 'removeFile',
			name: 'Remove File',
			action: 'Remove a file from a board',
			description: 'Remove one file from a board without deleting the file itself',
			method: 'DELETE',
			plane: 'regional',
			path: '/v1/boards/{boardId}/files/{fileId}',
			params: [boardIdParam, pathLocator('fileId', 'File', 'file')],
		},
		{
			resource: 'board',
			operation: 'setFileProperty',
			name: 'Set File Property',
			action: 'Set a property value on a board file',
			description: 'Set the value of a board property on a file within the board',
			method: 'PUT',
			plane: 'regional',
			path: '/v1/boards/{boardId}/files/{fileId}/properties/{propertyId}',
			params: [
				boardIdParam,
				pathLocator('fileId', 'File', 'file'),
				{
					name: 'propertyId',
					displayName: 'Property',
					in: 'path',
					type: 'string',
					required: true,
					placeholder: 'e.g. prop_… (Board Property → Get Many)',
				},
				...valueParams,
			],
			custom: setBoardFilePropertyValue,
		},
		{
			resource: 'board',
			operation: 'getMembers',
			name: 'Get Many Members',
			action: 'Get many members of a board',
			description: 'List the members who have access to a board',
			method: 'GET',
			plane: 'regional',
			path: '/v1/boards/{boardId}/members',
			list: false,
			params: [boardIdParam],
		},
	],
};
