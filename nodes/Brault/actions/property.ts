/*
 * Catalogue data, not n8n INodeProperties: these ParamSpec objects only share the
 * displayName/name/type shape. catalogue/build-properties.ts turns them into real node
 * properties and always emits a `default` there.
 */
/* eslint-disable n8n-nodes-base/node-param-default-missing */
import { bodyParam, pathLocator } from '../catalogue/common-params';
import type { ParamSpec, ResourceSpec } from '../catalogue/types';

const propertyIdParam = pathLocator('propertyId', 'Property', 'property');

const optionIdParam: ParamSpec = {
	name: 'optionId',
	displayName: 'Option',
	in: 'path',
	type: 'string',
	required: true,
	placeholder: 'e.g. opt_…',
};

const PROPERTY_TYPES = [
	{ name: 'Tag', value: 'tag' },
	{ name: 'Text', value: 'text' },
	{ name: 'Date', value: 'date' },
	{ name: 'Checkbox', value: 'checkbox' },
	{ name: 'Person', value: 'person' },
];

const SELECTION_MODES = [
	{ name: 'Single', value: 'single' },
	{ name: 'Multiple', value: 'multiple' },
];

export const property: ResourceSpec = {
	value: 'property',
	name: 'Property',
	description: 'Brandspace-wide properties applied to files',
	operations: [
		{
			resource: 'property',
			operation: 'getAll',
			name: 'Get Many',
			action: 'Get many properties',
			description: 'List the brandspace-wide properties',
			method: 'GET',
			plane: 'regional',
			path: '/v1/properties',
			list: true,
		},
		{
			resource: 'property',
			operation: 'get',
			name: 'Get',
			action: 'Get a property',
			description: 'Retrieve one property by ID',
			method: 'GET',
			plane: 'regional',
			path: '/v1/properties/{propertyId}',
			params: [propertyIdParam],
		},
		{
			resource: 'property',
			operation: 'create',
			name: 'Create',
			action: 'Create a property',
			description: 'Create a brandspace-wide property',
			method: 'POST',
			plane: 'regional',
			path: '/v1/properties',
			params: [
				bodyParam('name', 'Name', 'string', { required: true, placeholder: 'e.g. Campaign' }),
				bodyParam('type', 'Type', 'options', { required: true, default: 'tag', options: PROPERTY_TYPES }),
			],
			fields: [
				bodyParam('selection_mode', 'Selection Mode', 'options', {
					default: 'multiple',
					description: 'Whether a tag property allows one or multiple selected options',
					options: SELECTION_MODES,
				}),
			],
		},
		{
			resource: 'property',
			operation: 'update',
			name: 'Update',
			action: 'Update a property',
			description: 'Change the name or selection mode of a property',
			method: 'PATCH',
			plane: 'regional',
			path: '/v1/properties/{propertyId}',
			params: [propertyIdParam],
			fields: [
				bodyParam('name', 'Name', 'string'),
				bodyParam('selection_mode', 'Selection Mode', 'options', {
					default: 'multiple',
					description: 'Whether a tag property allows one or multiple selected options',
					options: SELECTION_MODES,
				}),
			],
		},
		{
			resource: 'property',
			operation: 'delete',
			name: 'Delete',
			action: 'Delete a property',
			description: 'Permanently delete a property',
			method: 'DELETE',
			plane: 'regional',
			path: '/v1/properties/{propertyId}',
			params: [propertyIdParam],
		},
		{
			resource: 'property',
			operation: 'addOption',
			name: 'Add Option',
			action: 'Add an option to a property',
			description: 'Add a selectable option to a tag property',
			method: 'POST',
			plane: 'regional',
			path: '/v1/properties/{propertyId}/options',
			params: [propertyIdParam, bodyParam('label', 'Label', 'string', { required: true })],
			fields: [bodyParam('color', 'Color', 'string')],
		},
		{
			resource: 'property',
			operation: 'updateOption',
			name: 'Update Option',
			action: 'Update a property option',
			description: 'Change the label, color, or visibility of an option',
			method: 'PATCH',
			plane: 'regional',
			path: '/v1/properties/{propertyId}/options/{optionId}',
			params: [propertyIdParam, optionIdParam],
			fields: [
				bodyParam('label', 'Label', 'string'),
				bodyParam('color', 'Color', 'string'),
				bodyParam('hidden', 'Hidden', 'boolean', { description: 'Whether to hide the option from pickers' }),
			],
		},
		{
			resource: 'property',
			operation: 'deleteOption',
			name: 'Delete Option',
			action: 'Delete a property option',
			description: 'Permanently delete an option from a property',
			method: 'DELETE',
			plane: 'regional',
			path: '/v1/properties/{propertyId}/options/{optionId}',
			params: [propertyIdParam, optionIdParam],
		},
	],
};
