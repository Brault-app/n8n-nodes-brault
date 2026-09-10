import type { IDataObject, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import type { OperationSpec } from '../catalogue/types';
import { readBinarySource, uploadWithSession } from '../transport/binary';
import { braultRequest } from '../transport/request';
import { readValues, toItems } from './run-operation';

const csv = (x: unknown): string[] =>
	typeof x === 'string' ? x.split(',').map((s) => s.trim()).filter(Boolean) : Array.isArray(x) ? (x as string[]) : [];

/**
 * Custom handler for Transfer → Create. Declares the transfer (existing files/folders
 * plus one upload slot per binary property), drives each declared upload to completion,
 * then finalizes the transfer. Completion always runs, even with zero uploads — an
 * `awaiting_uploads` transfer never becomes shareable otherwise.
 */
export async function createTransfer(ctx: IExecuteFunctions, i: number, spec: OperationSpec): Promise<INodeExecutionData[]> {
	const v = readValues(ctx, i, spec);
	const props = csv(v.binaryProperties);
	const sources = [];
	for (const p of props) sources.push(await readBinarySource(ctx, i, p));

	const body: IDataObject = {};
	const files = csv(v.file_ids).map((id) => ({ id }));
	if (files.length) body.files = files;
	const folders = csv(v.folder_ids);
	if (folders.length) body.folders = folders;
	if (sources.length) body.uploads = sources.map((s) => ({ name: s.fileName, size: s.size }));
	if (typeof v.password === 'string' && v.password) body.password = v.password;
	if (v.expires_in_days !== undefined && v.expires_in_days !== '') body.expires_in_days = Number(v.expires_in_days);

	const draft = await braultRequest<
		IDataObject & {
			id: string;
			uploads?: Array<{ id: string; name: string; method: 'put' | 'multipart'; url?: string | null; part_size?: number | null; content_type?: string | null }>;
		}
	>(ctx, { plane: 'regional', method: 'POST', path: '/v1/transfers', body, idempotent: true });

	const declared = draft.uploads ?? [];
	for (let k = 0; k < sources.length; k++) {
		const u = declared[k];
		if (!u) break;
		await uploadWithSession(
			ctx,
			{ id: u.id, method: u.method, url: u.url, part_size: u.part_size, content_type: u.content_type },
			sources[k].source,
			{ parts: `/v1/transfers/${draft.id}/uploads/${u.id}/parts`, complete: `/v1/transfers/${draft.id}/uploads/${u.id}/complete` },
			{ size: sources[k].size, mimeType: sources[k].mimeType },
		);
	}

	const done = await braultRequest<IDataObject>(ctx, { plane: 'regional', method: 'POST', path: `/v1/transfers/${draft.id}/complete` });
	return toItems(done, i);
}
