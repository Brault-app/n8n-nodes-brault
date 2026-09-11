import { bodyParam, pathLocator } from '../catalogue/common-params';
import type { ParamSpec, ResourceSpec } from '../catalogue/types';

const boardIdParam = pathLocator('boardId', 'Board', 'board');

const propertyIdParam: ParamSpec = {
	displayName: 'Property',
	name: 'propertyId',
	in: 'path',
	type: 'string',
	required: true,
	default: '',
	placeholder: 'e.g. prop_…',
};

const optionIdParam: ParamSpec = {
	displayName: 'Option',
	name: 'optionId',
	in: 'path',
	type: 'string',
	required: true,
	default: '',
	placeholder: 'e.g. opt_…',
};

const PROPERTY_TYPES = [
	{ name: 'Status', value: 'status' },
	{ name: 'Person', value: 'person' },
	{ name: 'Date', value: 'date' },
	{ name: 'Checkbox', value: 'checkbox' },
	{ name: 'Text', value: 'text' },
	{ name: 'Multi Tag', value: 'multi_tag' },
];

export const boardProperty: ResourceSpec = {
	value: 'boardProperty',
	name: 'Board Property',
	description: 'Columns of a board',
	operations: [
		{
			resource: 'boardProperty',
			operation: 'getAll',
			name: 'Get Many',
			action: 'Get many board properties',
			description: 'List the properties defined on a board',
			method: 'GET',
			plane: 'regional',
			path: '/v1/boards/{boardId}/properties',
			list: true,
			params: [boardIdParam],
		},
		{
			resource: 'boardProperty',
			operation: 'get',
			name: 'Get',
			action: 'Get a board property',
			description: 'Retrieve one board property by ID',
			method: 'GET',
			plane: 'regional',
			path: '/v1/boards/{boardId}/properties/{propertyId}',
			params: [boardIdParam, propertyIdParam],
		},
		{
			resource: 'boardProperty',
			operation: 'create',
			name: 'Create',
			action: 'Create a board property',
			description: 'Create a property (column) on a board',
			method: 'POST',
			plane: 'regional',
			path: '/v1/boards/{boardId}/properties',
			params: [
				boardIdParam,
				bodyParam('name', 'Name', 'string', { required: true, placeholder: 'e.g. Status' }),
				bodyParam('type', 'Type', 'options', { required: true, default: 'status', options: PROPERTY_TYPES }),
			],
			fields: [
				bodyParam('options', 'Options', 'json', {
					description: 'Array of { label, color } for status and tag properties',
				}),
			],
		},
		{
			resource: 'boardProperty',
			operation: 'update',
			name: 'Update',
			action: 'Update a board property',
			description: 'Rename a board property',
			method: 'PATCH',
			plane: 'regional',
			path: '/v1/boards/{boardId}/properties/{propertyId}',
			params: [boardIdParam, propertyIdParam, bodyParam('name', 'Name', 'string', { required: true })],
		},
		{
			resource: 'boardProperty',
			operation: 'delete',
			name: 'Delete',
			action: 'Delete a board property',
			description: 'Permanently delete a board property',
			method: 'DELETE',
			plane: 'regional',
			path: '/v1/boards/{boardId}/properties/{propertyId}',
			params: [boardIdParam, propertyIdParam],
		},
		{
			resource: 'boardProperty',
			operation: 'addOption',
			name: 'Add Option',
			action: 'Add an option to a board property',
			description: 'Add a selectable option to a status or tag property',
			method: 'POST',
			plane: 'regional',
			path: '/v1/boards/{boardId}/properties/{propertyId}/options',
			params: [boardIdParam, propertyIdParam, bodyParam('label', 'Label', 'string', { required: true })],
			fields: [bodyParam('color', 'Color', 'string')],
		},
		{
			resource: 'boardProperty',
			operation: 'updateOption',
			name: 'Update Option',
			action: 'Update a board property option',
			description: 'Change the label, color, or visibility of an option',
			method: 'PATCH',
			plane: 'regional',
			path: '/v1/boards/{boardId}/properties/{propertyId}/options/{optionId}',
			params: [boardIdParam, propertyIdParam, optionIdParam],
			fields: [
				bodyParam('label', 'Label', 'string'),
				bodyParam('color', 'Color', 'string'),
				bodyParam('hidden', 'Hidden', 'boolean', { description: 'Whether to hide the option from pickers' }),
			],
		},
		{
			resource: 'boardProperty',
			operation: 'deleteOption',
			name: 'Delete Option',
			action: 'Delete a board property option',
			description: 'Permanently delete an option from a board property',
			method: 'DELETE',
			plane: 'regional',
			path: '/v1/boards/{boardId}/properties/{propertyId}/options/{optionId}',
			params: [boardIdParam, propertyIdParam, optionIdParam],
		},
	],
};
