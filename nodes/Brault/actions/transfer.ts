import { bodyParam } from '../catalogue/common-params';
import type { ParamSpec, ResourceSpec } from '../catalogue/types';
import { createTransfer } from './transfer-create';

const transferIdParam: ParamSpec = {
	displayName: 'Transfer',
	name: 'transferId',
	in: 'path',
	type: 'string',
	required: true,
	default: '',
	placeholder: 'e.g. the /d/<ID> slug',
};

export const transfer: ResourceSpec = {
	value: 'transfer',
	name: 'Transfer',
	description: 'Send files and folders by link, from existing library items or new uploads',
	operations: [
		{
			resource: 'transfer',
			operation: 'getAll',
			name: 'Get Many',
			action: 'Get many transfers',
			description: 'List the transfers in the brandspace, newest first',
			method: 'GET',
			plane: 'regional',
			path: '/v1/transfers',
			list: true,
		},
		{
			resource: 'transfer',
			operation: 'get',
			name: 'Get',
			action: 'Get a transfer',
			description: 'Retrieve one transfer by ID, with its files and folders',
			method: 'GET',
			plane: 'regional',
			path: '/v1/transfers/{transferId}',
			params: [transferIdParam],
		},
		{
			resource: 'transfer',
			operation: 'create',
			name: 'Create',
			action: 'Create a transfer',
			description: 'Send files by link, from existing files, folders or binary data',
			method: 'POST',
			plane: 'regional',
			path: '/v1/transfers',
			fields: [
				bodyParam('file_ids', 'File IDs', 'string', { csv: true, description: 'Comma-separated list of existing file IDs to include' }),
				bodyParam('folder_ids', 'Folder IDs', 'string', { csv: true, description: 'Comma-separated list of folder IDs to include' }),
				bodyParam('binaryProperties', 'Input Binary Fields', 'string', {
					csv: true,
					description: 'Binary properties of this item to upload into the transfer, e.g. data, data2',
				}),
				bodyParam('password', 'Password', 'string', { description: 'Password required to open the transfer' }),
				bodyParam('expires_in_days', 'Expires in Days', 'number', {
					default: 7,
					description: 'Whole days from creation until the transfer expires',
				}),
			],
			custom: createTransfer,
		},
		{
			resource: 'transfer',
			operation: 'update',
			name: 'Update',
			action: 'Update a transfer',
			description: 'Change the password or expiry of a transfer',
			method: 'PATCH',
			plane: 'regional',
			path: '/v1/transfers/{transferId}',
			params: [transferIdParam],
			fields: [
				bodyParam('password', 'Password', 'string', { description: 'New password required to open the transfer. Leave empty to keep the current one' }),
				bodyParam('expires_in_days', 'Expires in Days', 'number', {
					default: 7,
					description: 'Whole days counted from today until the transfer expires',
				}),
			],
		},
		{
			resource: 'transfer',
			operation: 'delete',
			name: 'Delete',
			action: 'Delete a transfer',
			description: 'Expire a transfer and delete its files',
			method: 'DELETE',
			plane: 'regional',
			path: '/v1/transfers/{transferId}',
			params: [transferIdParam],
		},
	],
};
