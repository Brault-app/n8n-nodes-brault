import type { IDataObject } from 'n8n-workflow';
import type { TransportContext } from './hosts';
import { braultRequest, type BraultRequestOptions, type ListEnvelope } from './request';

export const LIMIT_PARAM_MAX = 1000;
const PAGE_MAX = 100;

export async function getAll(ctx: TransportContext, opts: BraultRequestOptions, page: { returnAll: boolean; limit: number }): Promise<IDataObject[]> {
	const out: IDataObject[] = [];
	let cursor: string | null = null;
	for (;;) {
		const remaining = page.returnAll ? PAGE_MAX : Math.max(0, page.limit - out.length);
		if (remaining === 0) break;
		const pageParams: IDataObject = { limit: Math.min(PAGE_MAX, remaining), ...(cursor ? { cursor } : {}) };
		const req: BraultRequestOptions = opts.method === 'GET'
			? { ...opts, qs: { ...(opts.qs ?? {}), ...pageParams } }
			: { ...opts, body: { ...(opts.body ?? {}), ...pageParams } };
		const res = await braultRequest<ListEnvelope>(ctx, req);
		out.push(...res.data);
		if (!res.has_more || !res.next_cursor) break;
		cursor = res.next_cursor;
		if (!page.returnAll && out.length >= page.limit) break;
	}
	return page.returnAll ? out : out.slice(0, page.limit);
}
