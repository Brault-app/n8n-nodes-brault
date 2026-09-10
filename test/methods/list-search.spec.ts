import { listSearch } from '../../nodes/Brault/methods/list-search';
jest.mock('../../nodes/Brault/transport/request', () => ({ braultRequest: jest.fn() }));
import { braultRequest } from '../../nodes/Brault/transport/request';
const req = braultRequest as jest.Mock;
const ctx = { getNodeParameter: () => undefined } as never;

describe('listSearch', () => {
	beforeEach(() => req.mockReset());
	it('maps libraries to name/value and forwards the cursor', async () => {
		req.mockResolvedValueOnce({ object: 'list', data: [{ id: 'l1', name: 'Brand' }], has_more: true, next_cursor: 'c2' });
		await expect(listSearch.searchLibraries.call(ctx, 'bra', 'c1')).resolves.toEqual({ results: [{ name: 'Brand', value: 'l1' }], paginationToken: 'c2' });
		expect(req.mock.calls[0][1]).toMatchObject({ path: '/v1/libraries', qs: { limit: 50, cursor: 'c1' } });
	});
	it('filters client-side by name when the route has no search param', async () => {
		req.mockResolvedValueOnce({ object: 'list', data: [{ id: 'l1', name: 'Brand' }, { id: 'l2', name: 'Other' }], has_more: false, next_cursor: null });
		await expect(listSearch.searchLibraries.call(ctx, 'oth')).resolves.toEqual({ results: [{ name: 'Other', value: 'l2' }], paginationToken: undefined });
	});
	it('uses q for files', async () => {
		req.mockResolvedValueOnce({ object: 'list', data: [{ id: 'f1', name: 'hero.psd' }], has_more: false, next_cursor: null });
		await listSearch.searchFiles.call(ctx, 'hero');
		expect(req.mock.calls[0][1]).toMatchObject({ path: '/v1/files', qs: { q: 'hero', limit: 50 } });
	});
});
