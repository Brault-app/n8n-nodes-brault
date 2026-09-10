/*
 * Catalogue data, not n8n INodeProperties: these ParamSpec objects only share the
 * displayName/name/type shape. catalogue/build-properties.ts turns them into real node
 * properties and always emits a `default` there.
 */
import type { ResourceSpec } from '../catalogue/types';

export const brandspace: ResourceSpec = {
	value: 'brandspace',
	name: 'Brandspace',
	description: 'The brandspace the API key belongs to',
	operations: [
		{
			resource: 'brandspace',
			operation: 'get',
			name: 'Get',
			action: 'Get the brandspace',
			description: 'Retrieve the brandspace the API key belongs to',
			method: 'GET',
			plane: 'central',
			path: '/v1/brandspace',
		},
		{
			resource: 'brandspace',
			operation: 'getUsage',
			name: 'Get Usage',
			action: 'Get API usage for the brandspace',
			description: 'Current request, upload and download counters against the plan limits',
			method: 'GET',
			plane: 'central',
			path: '/v1/usage',
		},
	],
};
