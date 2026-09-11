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
					displayName: 'Import',
					name: 'importId',
					in: 'path',
					type: 'string',
					required: true,
					default: '',
					placeholder: 'e.g. imp_…',
				},
			],
		},
	],
};
