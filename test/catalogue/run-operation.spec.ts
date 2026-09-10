import type { IExecuteFunctions } from 'n8n-workflow';
import { runOperation, toItems } from '../../nodes/Brault/actions/run-operation';
import type { OperationSpec } from '../../nodes/Brault/catalogue/types';

jest.mock('../../nodes/Brault/transport/request', () => ({ braultRequest: jest.fn() }));
import { braultRequest } from '../../nodes/Brault/transport/request';

const mocked = braultRequest as jest.Mock;

const spec: OperationSpec = {
	resource: 'file',
	operation: 'getBoards',
	name: 'Get Boards',
	action: 'Get the boards of a file',
	description: 'List the boards a file belongs to',
	method: 'GET',
	plane: 'regional',
	path: '/v1/files/{fileId}/boards',
	params: [{ name: 'fileId', displayName: 'File', in: 'path', type: 'string', required: true, locator: 'file' }],
};

const ctx = {
	getNode: () => ({ name: 'Brault' }),
	getNodeParameter: jest.fn(() => 'fi_1'),
} as unknown as IExecuteFunctions;

describe('runOperation', () => {
	beforeEach(() => mocked.mockReset());

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
