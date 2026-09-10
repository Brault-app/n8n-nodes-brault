/*
 * Catalogue data, not n8n INodeProperties: these ParamSpec objects only share the
 * displayName/name/type shape. catalogue/build-properties.ts turns them into real node
 * properties and always emits a `default` there.
 */
/* eslint-disable n8n-nodes-base/node-param-default-missing */
import type { ResourceSpec } from '../catalogue/types';

export const importResource: ResourceSpec = {
	value: 'import',
	name: 'Import',
	description: 'Background imports of files started from a URL',
	operations: [
		{
			resource: 'import',
			operation: 'get',
			name: 'Get',
			action: 'Get an import',
			description: 'Check the status of an import from URL',
			method: 'GET',
			plane: 'regional',
			path: '/v1/imports/{importId}',
			params: [
				{
					name: 'importId',
					displayName: 'Import',
					in: 'path',
					type: 'string',
					required: true,
					placeholder: 'e.g. imp_…',
				},
			],
		},
	],
};
