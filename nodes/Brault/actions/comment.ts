/*
 * Catalogue data, not n8n INodeProperties: these ParamSpec objects only share the
 * displayName/name/type shape. catalogue/build-properties.ts turns them into real node
 * properties and always emits a `default` there.
 */
/* eslint-disable n8n-nodes-base/node-param-default-missing */
import { bodyParam, pathLocator, queryParam } from '../catalogue/common-params';
import type { ParamSpec, ResourceSpec } from '../catalogue/types';

const commentIdParam: ParamSpec = {
	name: 'commentId',
	displayName: 'Comment',
	in: 'path',
	type: 'string',
	required: true,
	placeholder: 'e.g. cmt_…',
};

export const comment: ResourceSpec = {
	value: 'comment',
	name: 'Comment',
	description: 'Comments left on a file',
	operations: [
		{
			resource: 'comment',
			operation: 'getAll',
			name: 'Get Many',
			action: 'Get many comments',
			description: 'List the comments on a file',
			method: 'GET',
			plane: 'regional',
			path: '/v1/files/{fileId}/comments',
			list: true,
			params: [pathLocator('fileId', 'File', 'file')],
			fields: [
				queryParam('resolved', 'Resolved', 'boolean', {
					description: 'Whether to return only resolved comments',
				}),
				queryParam('version_id', 'Version ID', 'string', {
					description: 'Only return comments left on this file version',
				}),
			],
		},
		{
			resource: 'comment',
			operation: 'get',
			name: 'Get',
			action: 'Get a comment',
			description: 'Retrieve one comment by ID',
			method: 'GET',
			plane: 'regional',
			path: '/v1/files/{fileId}/comments/{commentId}',
			params: [pathLocator('fileId', 'File', 'file'), commentIdParam],
		},
		{
			resource: 'comment',
			operation: 'create',
			name: 'Create',
			action: 'Create a comment',
			description: 'Add a comment to a file',
			method: 'POST',
			plane: 'regional',
			path: '/v1/files/{fileId}/comments',
			params: [
				pathLocator('fileId', 'File', 'file'),
				bodyParam('text', 'Text', 'string', { required: true, placeholder: 'e.g. Great shot!' }),
			],
			fields: [
				bodyParam('timestamp_ms', 'Timestamp (Ms)', 'number', {
					description: 'Position in a video or audio file',
				}),
				bodyParam('version_id', 'Version ID', 'string', {
					description: 'Attach the comment to this file version instead of the current version',
				}),
				bodyParam('annotations', 'Annotations', 'json', {
					description:
						'Array of { type, coordinates } objects, see developers.brault.app/docs/reference/comments',
				}),
			],
		},
		{
			resource: 'comment',
			operation: 'update',
			name: 'Update',
			action: 'Update a comment',
			description: 'Change the text of a comment',
			method: 'PATCH',
			plane: 'regional',
			path: '/v1/files/{fileId}/comments/{commentId}',
			params: [
				pathLocator('fileId', 'File', 'file'),
				commentIdParam,
				bodyParam('text', 'Text', 'string', { required: true }),
			],
		},
		{
			resource: 'comment',
			operation: 'delete',
			name: 'Delete',
			action: 'Delete a comment',
			description: 'Permanently delete a comment',
			method: 'DELETE',
			plane: 'regional',
			path: '/v1/files/{fileId}/comments/{commentId}',
			params: [pathLocator('fileId', 'File', 'file'), commentIdParam],
		},
		{
			resource: 'comment',
			operation: 'resolve',
			name: 'Resolve',
			action: 'Resolve a comment',
			description: 'Mark a comment thread as resolved',
			method: 'POST',
			plane: 'regional',
			path: '/v1/files/{fileId}/comments/{commentId}/resolve',
			params: [pathLocator('fileId', 'File', 'file'), commentIdParam],
		},
		{
			resource: 'comment',
			operation: 'reopen',
			name: 'Reopen',
			action: 'Reopen a comment',
			description: 'Mark a resolved comment as open again',
			method: 'POST',
			plane: 'regional',
			path: '/v1/files/{fileId}/comments/{commentId}/reopen',
			params: [pathLocator('fileId', 'File', 'file'), commentIdParam],
		},
	],
};
