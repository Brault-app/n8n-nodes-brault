/*
 * Catalogue data, not n8n INodeProperties: these ParamSpec objects only share the
 * displayName/name/type shape. catalogue/build-properties.ts turns them into real node
 * properties and always emits a `default` there.
 */
/* eslint-disable n8n-nodes-base/node-param-default-missing */
import type { ParamSpec, ResourceSpec } from '../catalogue/types';

const userIdParam: ParamSpec = {
	name: 'userId',
	displayName: 'User',
	in: 'path',
	type: 'string',
	required: true,
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
