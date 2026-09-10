import { getAll } from '../../nodes/Brault/transport/pagination';
jest.mock('../../nodes/Brault/transport/request', () => ({ braultRequest: jest.fn() }));
import { braultRequest } from '../../nodes/Brault/transport/request';
const mocked = braultRequest as jest.Mock;
const ctx = {} as never;

describe('getAll', () => {
	beforeEach(() => mocked.mockReset());
	it('follows next_cursor until has_more is false when returnAll', async () => {
		mocked.mockResolvedValueOnce({ object: 'list', data: [{ id: 1 }], has_more: true, next_cursor: 'c1' }).mockResolvedValueOnce({ object: 'list', data: [{ id: 2 }], has_more: false, next_cursor: null });
		await expect(getAll(ctx, { plane: 'regional', method: 'GET', path: '/v1/files' }, { returnAll: true, limit: 50 })).resolves.toEqual([{ id: 1 }, { id: 2 }]);
		expect(mocked.mock.calls[0][1].qs).toMatchObject({ limit: 100 });
		expect(mocked.mock.calls[1][1].qs).toMatchObject({ cursor: 'c1' });
	});
	it('stops at limit and trims the last page', async () => {
		mocked.mockResolvedValueOnce({ object: 'list', data: [{ id: 1 }, { id: 2 }, { id: 3 }], has_more: true, next_cursor: 'c1' });
		await expect(getAll(ctx, { plane: 'regional', method: 'GET', path: '/v1/files' }, { returnAll: false, limit: 2 })).resolves.toEqual([{ id: 1 }, { id: 2 }]);
		expect(mocked.mock.calls[0][1].qs).toMatchObject({ limit: 2 });
	});
	it('sends cursor and limit in the body for POST queries', async () => {
		mocked.mockResolvedValueOnce({ object: 'list', data: [], has_more: false, next_cursor: null });
		await getAll(ctx, { plane: 'regional', method: 'POST', path: '/v1/boards/b/query', body: { q: 'x' } }, { returnAll: false, limit: 10 });
		expect(mocked.mock.calls[0][1].body).toMatchObject({ q: 'x', limit: 10 });
	});
});
