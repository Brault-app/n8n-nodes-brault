/*
 * Catalogue data, not n8n INodeProperties: these ParamSpec objects only share the
 * displayName/name/type shape. catalogue/build-properties.ts turns them into real node
 * properties and always emits a `default` there.
 */
import type { ResourceSpec } from '../catalogue/types';

export const role: ResourceSpec = {
	value: 'role',
	name: 'Role',
	description: 'Roles available to assign to brandspace members',
	operations: [
		{
			resource: 'role',
			operation: 'getAll',
			name: 'Get Many',
			action: 'Get many roles',
			description: 'List the roles available in the brandspace',
			method: 'GET',
			plane: 'central',
			path: '/v1/roles',
			list: true,
		},
	],
};
