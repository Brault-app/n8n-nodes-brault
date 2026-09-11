import { bodyParam } from '../catalogue/common-params';
import type { ParamSpec, ResourceSpec } from '../catalogue/types';

const downloadIdParam: ParamSpec = {
	displayName: 'Download',
	name: 'downloadId',
	in: 'path',
	type: 'string',
	required: true,
	default: '',
	placeholder: 'e.g. dl_…',
};

const RENDITIONS = [
	{ name: 'Original', value: 'original' },
	{ name: 'Preview', value: 'preview' },
	{ name: 'Thumbnail', value: 'thumbnail' },
];

export const bulkDownload: ResourceSpec = {
	value: 'bulkDownload',
	name: 'Bulk Download',
	description: 'Zip several files or folders',
	operations: [
		{
			resource: 'bulkDownload',
			operation: 'create',
			name: 'Create',
			action: 'Create a bulk download',
			description: 'Start zipping a set of files and folders for download',
			method: 'POST',
			plane: 'regional',
			path: '/v1/downloads',
			fields: [
				bodyParam('file_ids', 'File IDs', 'string', { csv: true, description: 'Comma-separated list of file IDs to include' }),
				bodyParam('folder_ids', 'Folder IDs', 'string', { csv: true, description: 'Comma-separated list of folder IDs to include' }),
				bodyParam('renditions', 'Renditions', 'multiOptions', {
					description: 'File renditions to include in the zip; defaults to the original files',
					options: RENDITIONS,
				}),
			],
		},
		{
			resource: 'bulkDownload',
			operation: 'get',
			name: 'Get',
			action: 'Get a bulk download',
			description: 'Check the status of a bulk download; returns a download URL once ready',
			method: 'GET',
			plane: 'regional',
			path: '/v1/downloads/{downloadId}',
			params: [downloadIdParam],
		},
	],
};
