import type { IDataObject, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { coerce } from '../catalogue/plan-request';
import type { OperationSpec } from '../catalogue/types';
import { braultRequest } from '../transport/request';
import { downloadToBinary, readBinarySource, uploadWithSession, type UploadSession } from '../transport/binary';
import { readValues, toItems } from './run-operation';

/** Custom handler for File → Upload. Starts an upload session, drives it to
 * completion (single PUT or multipart), and returns the created file/version. */
export async function uploadFile(ctx: IExecuteFunctions, i: number, spec: OperationSpec): Promise<INodeExecutionData[]> {
	const v = readValues(ctx, i, spec);
	for (const p of [...(spec.params ?? []), ...(spec.fields ?? [])]) v[p.name] = coerce(p, v[p.name]);
	const property = String(v.binaryProperty ?? 'data');
	const { source, size, fileName, mimeType } = await readBinarySource(ctx, i, property);
	const body: IDataObject = { name: String(v.name || fileName), size };
	for (const k of ['library_id', 'folder_id', 'file_id'])
		if (v[k] !== undefined) body[k] = v[k] as IDataObject[string];
	const session = await braultRequest<UploadSession>(ctx, { plane: 'regional', method: 'POST', path: '/v1/uploads', body, idempotent: true });
	const file = await uploadWithSession(
		ctx,
		session,
		source,
		{
			parts: `/v1/uploads/${session.id}/parts`,
			complete: `/v1/uploads/${session.id}/complete`,
			abort: `/v1/uploads/${session.id}/abort`,
		},
		{ size, mimeType },
	);
	return toItems(file, i);
}

/** Custom handler for File → Download. Resolves a signed rendition URL and the
 * file's metadata, then downloads the bytes into a binary property. */
export async function downloadFile(ctx: IExecuteFunctions, i: number, spec: OperationSpec): Promise<INodeExecutionData[]> {
	const v = readValues(ctx, i, spec);
	for (const p of [...(spec.params ?? []), ...(spec.fields ?? [])]) v[p.name] = coerce(p, v[p.name]);
	const fileId = String(v.fileId);
	const rendition = String(v.rendition ?? 'original');
	const link = await braultRequest<{ url: string; file_id: string; rendition: string }>(ctx, {
		plane: 'regional',
		method: 'GET',
		path: `/v1/files/${encodeURIComponent(fileId)}/download`,
		qs: { rendition },
	});
	const meta = await braultRequest<IDataObject>(ctx, { plane: 'regional', method: 'GET', path: `/v1/files/${encodeURIComponent(fileId)}` });
	const name = rendition === 'original' ? String(meta.name ?? fileId) : `${String(meta.name ?? fileId)}.${rendition}.jpg`;
	const binary = await downloadToBinary(ctx, link.url, name, rendition === 'original' ? String(meta.mime ?? '') || undefined : 'image/jpeg');
	return [{ json: meta, binary: { [String(v.binaryProperty ?? 'data')]: binary }, pairedItem: { item: i } }];
}
