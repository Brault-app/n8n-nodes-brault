/*
 * Catalogue data, not n8n INodeProperties: these ParamSpec objects only share the
 * displayName/name/type shape. catalogue/build-properties.ts turns them into real node
 * properties and always emits a `default` there.
 */
/* eslint-disable n8n-nodes-base/node-param-default-missing */
import { bodyParam } from '../catalogue/common-params';
import type { ParamSpec, ResourceSpec } from '../catalogue/types';
import { createSharedLink } from './shared-link-create';

const sharedLinkIdParam: ParamSpec = {
	name: 'sharedLinkId',
	displayName: 'Shared Link',
	in: 'path',
	type: 'string',
	required: true,
	placeholder: 'e.g. slk_…',
};

/** The kinds a shared link can point at, per the public API's SharedLinkTargetDto */
const TARGET_TYPES = [
	{ name: 'File', value: 'file' },
	{ name: 'Folder', value: 'folder' },
	{ name: 'Library', value: 'library' },
	{ name: 'Board', value: 'board' },
];

const ACCESS_LEVELS = [
	{ name: 'View', value: 'view' },
	{ name: 'Download', value: 'download' },
	{ name: 'Review', value: 'review' },
	{ name: 'Upload', value: 'upload' },
];

const DISPLAY_MODES = [
	{ name: 'Grid', value: 'grid' },
	{ name: 'List', value: 'list' },
	{ name: 'Presentation', value: 'presentation' },
];

export const sharedLink: ResourceSpec = {
	value: 'sharedLink',
	name: 'Shared Link',
	description: 'Public links that expose a file, folder, library, or board',
	operations: [
		{
			resource: 'sharedLink',
			operation: 'getAll',
			name: 'Get Many',
			action: 'Get many shared links',
			description: 'List the shared links in the brandspace',
			method: 'GET',
			plane: 'regional',
			path: '/v1/shared-links',
			list: true,
		},
		{
			resource: 'sharedLink',
			operation: 'get',
			name: 'Get',
			action: 'Get a shared link',
			description: 'Retrieve one shared link by ID',
			method: 'GET',
			plane: 'regional',
			path: '/v1/shared-links/{sharedLinkId}',
			params: [sharedLinkIdParam],
		},
		{
			resource: 'sharedLink',
			operation: 'create',
			name: 'Create',
			action: 'Create a shared link',
			description: 'Create a shared link that exposes a file, folder, library, or board',
			method: 'POST',
			plane: 'regional',
			path: '/v1/shared-links',
			params: [
				bodyParam('targetType', 'Target Type', 'options', {
					required: true,
					default: TARGET_TYPES[0].value,
					description: 'Kind of item the shared link points at',
					options: TARGET_TYPES,
				}),
				bodyParam('targetId', 'Target ID', 'string', { required: true, placeholder: 'e.g. fil_…' }),
			],
			fields: [
				bodyParam('access', 'Access', 'options', {
					default: 'download',
					description: 'Permission level granted to visitors of the shared link',
					options: ACCESS_LEVELS,
				}),
				bodyParam('password', 'Password', 'string', { description: 'Password required to open the shared link' }),
				bodyParam('expires_at', 'Expires At', 'dateTime', { description: 'When the shared link stops working' }),
				bodyParam('anonymous_comments', 'Anonymous Comments', 'boolean', {
					description: 'Whether visitors may comment without an account',
				}),
				bodyParam('board_views', 'Board Views', 'json', {
					description: 'Board target only: { default, allowed } view names, gallery or table',
				}),
			],
			custom: createSharedLink,
		},
		{
			resource: 'sharedLink',
			operation: 'update',
			name: 'Update',
			action: 'Update a shared link',
			description: 'Change the access, password, expiry, or display settings of a shared link',
			method: 'PATCH',
			plane: 'regional',
			path: '/v1/shared-links/{sharedLinkId}',
			params: [sharedLinkIdParam],
			fields: [
				bodyParam('access', 'Access', 'options', {
					default: 'download',
					description: 'Permission level granted to visitors of the shared link',
					options: ACCESS_LEVELS,
				}),
				bodyParam('password', 'Password', 'string', { description: 'Password required to open the shared link' }),
				bodyParam('expires_at', 'Expires At', 'dateTime', { description: 'When the shared link stops working' }),
				bodyParam('anonymous_comments', 'Anonymous Comments', 'boolean', {
					description: 'Whether visitors may comment without an account',
				}),
				bodyParam('show_versions', 'Show Versions', 'boolean', { description: 'Whether visitors can see previous file versions' }),
				bodyParam('show_properties', 'Show Properties', 'boolean', { description: 'Whether visitors can see board property values' }),
				bodyParam('display_mode', 'Display Mode', 'options', {
					default: 'grid',
					description: 'Layout used to present the shared items',
					options: DISPLAY_MODES,
				}),
				bodyParam('board_views', 'Board Views', 'json', {
					description: 'Board target only: { default, allowed } view names, gallery or table',
				}),
			],
		},
		{
			resource: 'sharedLink',
			operation: 'delete',
			name: 'Delete',
			action: 'Delete a shared link',
			description: 'Permanently delete a shared link',
			method: 'DELETE',
			plane: 'regional',
			path: '/v1/shared-links/{sharedLinkId}',
			params: [sharedLinkIdParam],
		},
	],
};
