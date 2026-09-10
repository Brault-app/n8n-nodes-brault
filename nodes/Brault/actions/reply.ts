/*
 * Catalogue data, not n8n INodeProperties: these ParamSpec objects only share the
 * displayName/name/type shape. catalogue/build-properties.ts turns them into real node
 * properties and always emits a `default` there.
 */
/* eslint-disable n8n-nodes-base/node-param-default-missing */
import { bodyParam, pathLocator } from '../catalogue/common-params';
import type { ParamSpec, ResourceSpec } from '../catalogue/types';

const commentIdParam: ParamSpec = {
	name: 'commentId',
	displayName: 'Comment',
	in: 'path',
	type: 'string',
	required: true,
	placeholder: 'e.g. cmt_…',
};

const replyIdParam: ParamSpec = {
	name: 'replyId',
	displayName: 'Reply',
	in: 'path',
	type: 'string',
	required: true,
	placeholder: 'e.g. rpl_…',
};

export const reply: ResourceSpec = {
	value: 'reply',
	name: 'Reply',
	description: 'Replies to a comment on a file',
	operations: [
		{
			resource: 'reply',
			operation: 'getAll',
			name: 'Get Many',
			action: 'Get many replies',
			description: 'List the replies on a comment',
			method: 'GET',
			plane: 'regional',
			path: '/v1/files/{fileId}/comments/{commentId}/replies',
			list: true,
			params: [pathLocator('fileId', 'File', 'file'), commentIdParam],
		},
		{
			resource: 'reply',
			operation: 'create',
			name: 'Create',
			action: 'Create a reply',
			description: 'Add a reply to a comment',
			method: 'POST',
			plane: 'regional',
			path: '/v1/files/{fileId}/comments/{commentId}/replies',
			params: [
				pathLocator('fileId', 'File', 'file'),
				commentIdParam,
				bodyParam('text', 'Text', 'string', { required: true, placeholder: 'e.g. Thanks, fixed!' }),
			],
		},
		{
			resource: 'reply',
			operation: 'update',
			name: 'Update',
			action: 'Update a reply',
			description: 'Change the text of a reply',
			method: 'PATCH',
			plane: 'regional',
			path: '/v1/files/{fileId}/comments/{commentId}/replies/{replyId}',
			params: [
				pathLocator('fileId', 'File', 'file'),
				commentIdParam,
				replyIdParam,
				bodyParam('text', 'Text', 'string', { required: true }),
			],
		},
		{
			resource: 'reply',
			operation: 'delete',
			name: 'Delete',
			action: 'Delete a reply',
			description: 'Permanently delete a reply',
			method: 'DELETE',
			plane: 'regional',
			path: '/v1/files/{fileId}/comments/{commentId}/replies/{replyId}',
			params: [pathLocator('fileId', 'File', 'file'), commentIdParam, replyIdParam],
		},
	],
};
