import type { IExecuteFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { runOperation, toItems } from '../../nodes/Brault/actions/run-operation';
import type { OperationSpec } from '../../nodes/Brault/catalogue/types';

// Keep the transport module's real isListEnvelope (run-operation.ts depends on it directly)
// while replacing only braultRequest with a mock.
jest.mock('../../nodes/Brault/transport/request', () => ({
	...jest.requireActual('../../nodes/Brault/transport/request'),
	braultRequest: jest.fn(),
}));
jest.mock('../../nodes/Brault/transport/pagination', () => ({ getAll: jest.fn() }));
import { getAll } from '../../nodes/Brault/transport/pagination';
import { braultRequest } from '../../nodes/Brault/transport/request';

const mocked = braultRequest as jest.Mock;
const mockedGetAll = getAll as jest.Mock;

const spec: OperationSpec = {
	resource: 'file',
	operation: 'getBoards',
	name: 'Get Boards',
	action: 'Get the boards of a file',
	description: 'List the boards a file belongs to',
	method: 'GET',
	plane: 'regional',
	path: '/v1/files/{fileId}/boards',
	params: [{ name: 'fileId', displayName: 'File', in: 'path', type: 'string', required: true, default: '', locator: 'file' }],
};

const ctx = {
	getNode: () => ({ name: 'Brault' }),
	getNodeParameter: jest.fn(() => 'fi_1'),
} as unknown as IExecuteFunctions;

describe('runOperation', () => {
	beforeEach(() => {
		mocked.mockReset();
		mockedGetAll.mockReset();
	});

	it('emits one item per element of a single-page list envelope', async () => {
		mocked.mockResolvedValueOnce({
			object: 'list',
			data: [{ id: 'bo_1' }, { id: 'bo_2' }],
			has_more: false,
			next_cursor: null,
		});
		const items = await runOperation(ctx, 0, spec);
		expect(items).toEqual([
			{ json: { id: 'bo_1' }, pairedItem: { item: 0 } },
			{ json: { id: 'bo_2' }, pairedItem: { item: 0 } },
		]);
		expect(mocked.mock.calls[0][1]).toMatchObject({ method: 'GET', path: '/v1/files/fi_1/boards' });
	});

	it('emits a single item for a single object', async () => {
		mocked.mockResolvedValueOnce({ id: 'fi_1', name: 'shot.mov' });
		const items = await runOperation(ctx, 0, spec);
		expect(items).toEqual([{ json: { id: 'fi_1', name: 'shot.mov' }, pairedItem: { item: 0 } }]);
	});

	it('uses spec.custom when present and never calls braultRequest', async () => {
		const customHandler = jest.fn(async () => [{ json: { ok: true }, pairedItem: { item: 0 } }]);
		const customSpec: OperationSpec = {
			resource: 'file',
			operation: 'customThing',
			name: 'Custom',
			action: 'Do a custom thing',
			description: 'Runs custom logic instead of the generic engine',
			method: 'GET',
			plane: 'regional',
			path: '/v1/files/custom',
			custom: customHandler,
		};
		const items = await runOperation(ctx, 0, customSpec);
		expect(items).toEqual([{ json: { ok: true }, pairedItem: { item: 0 } }]);
		expect(customHandler).toHaveBeenCalledWith(ctx, 0, customSpec);
		expect(mocked).not.toHaveBeenCalled();
		expect(mockedGetAll).not.toHaveBeenCalled();
	});

	it('reads returnAll/limit for a list spec and calls getAll with idempotent: false', async () => {
		const listSpec: OperationSpec = {
			resource: 'library',
			operation: 'getAll',
			name: 'Get Many',
			action: 'Get many libraries',
			description: 'List the libraries the key can see',
			method: 'GET',
			plane: 'regional',
			path: '/v1/libraries',
			list: true,
		};
		const listCtx = {
			getNode: () => ({ name: 'Brault' }),
			getNodeParameter: jest.fn((name: string) => {
				if (name === 'returnAll') return true;
				if (name === 'limit') return 25;
				return undefined;
			}),
		} as unknown as IExecuteFunctions;
		mockedGetAll.mockResolvedValueOnce([{ id: 'li_1' }]);

		const items = await runOperation(listCtx, 2, listSpec);

		expect(mockedGetAll).toHaveBeenCalledWith(
			listCtx,
			expect.objectContaining({ method: 'GET', path: '/v1/libraries', idempotent: false }),
			{ returnAll: true, limit: 25 },
		);
		expect(items).toEqual([{ json: { id: 'li_1' }, pairedItem: { item: 2 } }]);
	});

	it('marks a GET spec not idempotent when calling braultRequest', async () => {
		mocked.mockResolvedValueOnce({ id: 'fi_1' });
		await runOperation(ctx, 0, spec);
		expect(mocked.mock.calls[0][1]).toMatchObject({ idempotent: false });
	});

	it('marks a POST spec idempotent when calling braultRequest', async () => {
		const postSpec: OperationSpec = {
			resource: 'library',
			operation: 'create',
			name: 'Create',
			action: 'Create a library',
			description: 'Create a new library',
			method: 'POST',
			plane: 'regional',
			path: '/v1/libraries',
			params: [{ name: 'name', displayName: 'Name', in: 'body', type: 'string', required: true, default: '' }],
		};
		const createCtx = {
			getNode: () => ({ name: 'Brault' }),
			getNodeParameter: jest.fn(() => 'New Library'),
		} as unknown as IExecuteFunctions;
		mocked.mockResolvedValueOnce({ id: 'li_1' });
		await runOperation(createCtx, 0, postSpec);
		expect(mocked.mock.calls[0][1]).toMatchObject({ idempotent: true });
	});

	it('rejects with a NodeOperationError carrying the item index when a required path param is missing', async () => {
		const ctxNoParam = {
			getNode: () => ({ name: 'Brault' }),
			getNodeParameter: jest.fn(() => undefined),
		} as unknown as IExecuteFunctions;

		let caught: unknown;
		try {
			await runOperation(ctxNoParam, 4, spec);
		} catch (e) {
			caught = e;
		}
		expect(caught).toBeInstanceOf(NodeOperationError);
		expect((caught as NodeOperationError).context.itemIndex).toBe(4);
		expect((caught as NodeOperationError).message).toMatch(/File/);
	});
});

describe('toItems', () => {
	it('unwraps a list envelope, keeps arrays and wraps single objects', () => {
		expect(toItems({ object: 'list', data: [{ a: 1 }, { a: 2 }], has_more: false, next_cursor: null }, 3)).toEqual([
			{ json: { a: 1 }, pairedItem: { item: 3 } },
			{ json: { a: 2 }, pairedItem: { item: 3 } },
		]);
		expect(toItems([{ a: 1 }], 1)).toEqual([{ json: { a: 1 }, pairedItem: { item: 1 } }]);
		expect(toItems({ a: 1 }, 0)).toEqual([{ json: { a: 1 }, pairedItem: { item: 0 } }]);
	});
});
