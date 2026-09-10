import type { IBinaryData, IDataObject, IExecuteFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import type { TransportContext } from './hosts';
import { braultRequest } from './request';

/**
 * A readable byte source. Node's `Readable` (returned by `ctx.helpers.getBinaryStream`)
 * satisfies this shape structurally, but the type is declared locally instead of
 * imported from `stream` — `n8n-node lint`'s Cloud-compatibility check
 * (`@n8n/community-nodes/no-restricted-imports`) rejects any import of the `stream`
 * module, value or type-only, since community nodes may run in a sandboxed process
 * that cannot pass a live stream across the boundary.
 */
type ByteStream = NodeJS.ReadableStream;

export interface UploadSession {
	id: string;
	method: 'put' | 'multipart';
	upload_url?: string | null;
	url?: string | null;
	part_size?: number | null;
	part_count?: number | null;
}
export interface UploadRoutes {
	parts: string;
	complete: string;
	abort?: string;
}

/**
 * Re-chunks a Buffer or Readable into exact `partSize` slices, with a short final
 * tail. Buffers a stream's bytes only up to one part at a time, so memory never
 * exceeds `partSize` regardless of source size.
 */
export async function* chunkSource(source: ByteStream | Buffer, partSize: number): AsyncGenerator<Buffer> {
	if (Buffer.isBuffer(source)) {
		for (let o = 0; o < source.length; o += partSize) yield source.subarray(o, Math.min(o + partSize, source.length));
		return;
	}
	let pending: Buffer[] = [];
	let pendingLength = 0;
	for await (const chunk of source) {
		let buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
		while (pendingLength + buf.length >= partSize) {
			const take = partSize - pendingLength;
			pending.push(buf.subarray(0, take));
			yield Buffer.concat(pending);
			pending = [];
			pendingLength = 0;
			buf = buf.subarray(take);
		}
		if (buf.length) {
			pending.push(buf);
			pendingLength += buf.length;
		}
	}
	if (pendingLength) yield Buffer.concat(pending);
}

async function putBytes(ctx: TransportContext, url: string, body: Buffer | ByteStream, size?: number): Promise<string> {
	const headers: Record<string, string> = { 'Content-Type': 'application/octet-stream' };
	if (size !== undefined) headers['Content-Length'] = String(size);
	const res = (await ctx.helpers.httpRequest({ method: 'PUT', url, body, headers, returnFullResponse: true })) as {
		headers?: Record<string, string>;
	};
	return String(res.headers?.etag ?? '').replace(/"/g, '');
}

/**
 * Drives an upload session to completion: PUTs the bytes (unauthenticated —
 * pre-signed S3 URLs reject an Authorization header) directly or in `part_size`
 * chunks, then calls `routes.complete`. On any failure, calls `routes.abort` when
 * given so no upload session is left dangling, then rethrows.
 */
export async function uploadWithSession(
	ctx: TransportContext,
	session: UploadSession,
	source: ByteStream | Buffer,
	routes: UploadRoutes,
): Promise<IDataObject> {
	try {
		if (session.method === 'put') {
			const target = session.upload_url ?? session.url;
			if (!target) throw new NodeOperationError(ctx.getNode(), 'Upload session has no PUT URL');
			await putBytes(ctx, target, source, Buffer.isBuffer(source) ? source.length : undefined);
			return braultRequest<IDataObject>(ctx, { plane: 'regional', method: 'POST', path: routes.complete, body: {} });
		}
		const partSize = Number(session.part_size ?? 64 * 1024 * 1024);
		const parts: Array<{ part_number: number; etag: string }> = [];
		let partNumber = 0;
		for await (const chunk of chunkSource(source, partSize)) {
			partNumber += 1;
			const issued = await braultRequest<{ parts: Array<{ part_number: number; upload_url: string }> }>(ctx, {
				plane: 'regional',
				method: 'POST',
				path: routes.parts,
				body: { part_numbers: [partNumber] },
			});
			const url = issued.parts.find((p) => p.part_number === partNumber)?.upload_url;
			if (!url) throw new NodeOperationError(ctx.getNode(), `No upload URL for part ${partNumber}`);
			parts.push({ part_number: partNumber, etag: await putBytes(ctx, url, chunk, chunk.length) });
		}
		return braultRequest<IDataObject>(ctx, { plane: 'regional', method: 'POST', path: routes.complete, body: { parts } });
	} catch (error) {
		if (routes.abort) {
			try {
				await braultRequest(ctx, { plane: 'regional', method: 'POST', path: routes.abort });
			} catch {
				/* best effort */
			}
		}
		throw new NodeOperationError(ctx.getNode(), (error as Error).message);
	}
}

/**
 * Reads an n8n binary property as an upload source. Binary data backed by the
 * filesystem/object-store manager (has an `id`) streams via `getBinaryStream` so
 * memory never holds the whole file; inline binary data (no `id`) falls back to
 * the in-memory buffer.
 */
export async function readBinarySource(
	ctx: IExecuteFunctions,
	i: number,
	property: string,
): Promise<{ source: ByteStream | Buffer; size: number; fileName: string; mimeType: string }> {
	const binary = ctx.helpers.assertBinaryData(i, property);
	const fileName = binary.fileName ?? 'file';
	const mimeType = binary.mimeType ?? 'application/octet-stream';
	if (binary.id) {
		const meta = await ctx.helpers.getBinaryMetadata(binary.id);
		return { source: await ctx.helpers.getBinaryStream(binary.id), size: Number(meta.fileSize ?? 0), fileName, mimeType };
	}
	const buffer = await ctx.helpers.getBinaryDataBuffer(i, property);
	return { source: buffer, size: buffer.length, fileName, mimeType };
}

/** Downloads a signed URL into an n8n binary property. */
export async function downloadToBinary(ctx: IExecuteFunctions, url: string, fileName: string, mimeType?: string): Promise<IBinaryData> {
	const res = (await ctx.helpers.httpRequest({ method: 'GET', url, encoding: 'arraybuffer', returnFullResponse: true })) as {
		body: Buffer;
		headers: Record<string, string>;
	};
	return ctx.helpers.prepareBinaryData(Buffer.from(res.body), fileName, mimeType ?? res.headers['content-type']);
}
