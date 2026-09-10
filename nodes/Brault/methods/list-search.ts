import type { IDataObject, ILoadOptionsFunctions, INodeListSearchResult } from 'n8n-workflow';
import { braultRequest, type ListEnvelope } from '../transport/request';

export type ListSearchMethod = (
	this: ILoadOptionsFunctions,
	filter?: string,
	paginationToken?: string,
) => Promise<INodeListSearchResult>;

type Row = IDataObject & { id: string; name?: string };

async function search(
	ctx: ILoadOptionsFunctions,
	path: string,
	filter?: string,
	cursor?: string,
	serverSearch = false,
	extraQs: IDataObject = {},
): Promise<INodeListSearchResult> {
	const qs: IDataObject = { limit: 50, ...extraQs };
	if (cursor) qs.cursor = cursor;
	if (serverSearch && filter) qs.q = filter;
	const res = await braultRequest<ListEnvelope<Row>>(ctx, { plane: 'regional', method: 'GET', path, qs });
	const needle = (filter ?? '').toLowerCase();
	const rows = serverSearch || !needle ? res.data : res.data.filter((r) => String(r.name ?? '').toLowerCase().includes(needle));
	return {
		results: rows.map((r) => ({ name: String(r.name ?? r.id), value: r.id })),
		paginationToken: res.has_more && res.next_cursor ? res.next_cursor : undefined,
	};
}

export const listSearch: Record<string, ListSearchMethod> = {
	async searchLibraries(this: ILoadOptionsFunctions, filter?: string, token?: string) {
		return search(this, '/v1/libraries', filter, token);
	},
	async searchFolders(this: ILoadOptionsFunctions, filter?: string, token?: string) {
		return search(this, '/v1/folders', filter, token, false, { recursive: true });
	},
	async searchFiles(this: ILoadOptionsFunctions, filter?: string, token?: string) {
		return search(this, '/v1/files', filter, token, true);
	},
	async searchBoards(this: ILoadOptionsFunctions, filter?: string, token?: string) {
		return search(this, '/v1/boards', filter, token);
	},
	async searchPages(this: ILoadOptionsFunctions, filter?: string, token?: string) {
		return search(this, '/v1/pages', filter, token);
	},
	async searchProperties(this: ILoadOptionsFunctions, filter?: string, token?: string) {
		return search(this, '/v1/properties', filter, token);
	},
};
