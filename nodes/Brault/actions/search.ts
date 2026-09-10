/*
 * Catalogue data, not n8n INodeProperties: these ParamSpec objects only share the
 * displayName/name/type shape. catalogue/build-properties.ts turns them into real node
 * properties and always emits a `default` there.
 */
/* eslint-disable n8n-nodes-base/node-param-default-missing */
import { queryParam } from '../catalogue/common-params';
import type { ResourceSpec } from '../catalogue/types';

export const search: ResourceSpec = {
	value: 'search',
	name: 'Search',
	description: 'Natural-language search across the brandspace',
	operations: [
		{
			resource: 'search',
			operation: 'search',
			name: 'Search',
			action: 'Search files and folders',
			description: 'Natural-language search across the brandspace',
			method: 'GET',
			plane: 'regional',
			path: '/v1/search',
			list: true,
			params: [
				queryParam('q', 'Query', 'string', { required: true, placeholder: 'e.g. red sneakers on white' }),
			],
			fields: [
				queryParam('scope', 'Scope', 'string', { description: 'Library or folder ID to search in' }),
			],
		},
	],
};
