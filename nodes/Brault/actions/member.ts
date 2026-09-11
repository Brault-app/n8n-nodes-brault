import type { ParamSpec, ResourceSpec } from '../catalogue/types';

const userIdParam: ParamSpec = {
	displayName: 'User',
	name: 'userId',
	in: 'path',
	type: 'string',
	required: true,
	default: '',
	placeholder: 'e.g. usr_…',
};

export const member: ResourceSpec = {
	value: 'member',
	name: 'Member',
	description: 'Members of the brandspace',
	operations: [
		{
			resource: 'member',
			operation: 'getAll',
			name: 'Get Many',
			action: 'Get many members',
			description: 'List the members of the brandspace',
			method: 'GET',
			plane: 'central',
			path: '/v1/members',
			list: true,
		},
		{
			resource: 'member',
			operation: 'get',
			name: 'Get',
			action: 'Get a member',
			description: 'Retrieve one member by user ID',
			method: 'GET',
			plane: 'central',
			path: '/v1/members/{userId}',
			params: [userIdParam],
		},
	],
};
