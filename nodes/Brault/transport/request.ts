import type { IDataObject, IHttpRequestOptions } from 'n8n-workflow';
import { sleep } from 'n8n-workflow';
import { resolveHosts, type TransportContext } from './hosts';
import { newIdempotencyKey } from './idempotency';
import { toNodeApiError } from './errors';

export type Plane = 'central' | 'regional';
export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export interface BraultRequestOptions {
	plane: Plane;
	method: HttpMethod;
	path: string;
	qs?: IDataObject;
	body?: IDataObject;
	headers?: Record<string, string>;
	idempotent?: boolean;
}

export interface BraultResponse<T = unknown> {
	statusCode: number;
	headers: Record<string, unknown>;
	body: T;
}

export interface ListEnvelope<T = IDataObject> {
	object: 'list';
	data: T[];
	has_more: boolean;
	next_cursor: string | null;
}

const RETRY_AFTER_MAX_SECONDS = 10;

export async function braultRequestRaw(ctx: TransportContext, opts: BraultRequestOptions): Promise<BraultResponse> {
	const hosts = await resolveHosts(ctx);
	const base = opts.plane === 'central' ? hosts.central : hosts.regional;
	const headers: Record<string, string> = { Accept: 'application/json', ...(opts.headers ?? {}) };
	if (opts.idempotent && opts.method === 'POST') headers['Idempotency-Key'] = newIdempotencyKey();

	const request: IHttpRequestOptions = {
		method: opts.method,
		url: `${base}${opts.path}`,
		headers,
		json: true,
		returnFullResponse: true,
		ignoreHttpStatusErrors: true,
	};
	if (opts.qs !== undefined) request.qs = opts.qs;
	if (opts.body !== undefined) request.body = opts.body;

	const send = async (): Promise<BraultResponse> =>
		(await ctx.helpers.httpRequestWithAuthentication.call(ctx, 'braultApi', request)) as BraultResponse;

	let res = await send();
	if (res.statusCode === 429) {
		const retryAfter = Number(res.headers?.['retry-after'] ?? NaN);
		if (Number.isFinite(retryAfter) && retryAfter <= RETRY_AFTER_MAX_SECONDS) {
			await sleep(retryAfter * 1000);
			res = await send();
		}
	}
	return res;
}

export function isListEnvelope(body: unknown): body is ListEnvelope {
	return !!body && typeof body === 'object' && (body as IDataObject).object === 'list' && Array.isArray((body as IDataObject).data);
}

function isEmptyBody(body: unknown): boolean {
	if (body === null || body === undefined) return true;
	if (typeof body === 'string' && body.trim() === '') return true;
	return false;
}

export async function braultRequest<T = IDataObject>(ctx: TransportContext, opts: BraultRequestOptions): Promise<T> {
	const res = await braultRequestRaw(ctx, opts);
	if (res.statusCode < 200 || res.statusCode >= 300) throw toNodeApiError(ctx.getNode(), res);
	const body = res.body as unknown;
	if (isEmptyBody(body)) return {} as T;
	if (isListEnvelope(body)) return body as unknown as T;
	if (body && typeof body === 'object' && 'data' in (body as IDataObject)) return (body as IDataObject).data as T;
	return body as T;
}
