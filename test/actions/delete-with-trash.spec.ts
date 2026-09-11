import type { IExecuteFunctions } from 'n8n-workflow';
import { file } from '../../nodes/Brault/actions/file';
import { folder } from '../../nodes/Brault/actions/folder';
import { page } from '../../nodes/Brault/actions/page';

jest.mock('../../nodes/Brault/transport/request', () => ({
	...jest.requireActual('../../nodes/Brault/transport/request'),
	braultRequest: jest.fn(),
	braultRequestRaw: jest.fn(),
}));

import { deleteWithTrash } from '../../nodes/Brault/actions/delete-with-trash';
import { braultRequest, braultRequestRaw } from '../../nodes/Brault/transport/request';

const req = braultRequest as jest.Mock;
const raw = braultRequestRaw as jest.Mock;

const fileDelete = file.operations.find((o) => o.operation === 'delete');
if (!fileDelete) throw new Error('file.delete operation spec not found');

function makeCtx(additionalFields: Record<string, unknown>): IExecuteFunctions {
	return {
		getNode: () => ({ name: 'Brault' }),
		getNodeParameter: jest.fn((name: string, _i: number, def?: unknown) => {
			if (name === 'additionalFields') return additionalFields;
			if (name === 'fileId') return 'f1';
			return def;
		}),
	} as unknown as IExecuteFunctions;
}

describe('deleteWithTrash', () => {
	beforeEach(() => {
		req.mockReset();
		raw.mockReset();
	});

	it('trashes the item first, then repeats the call with permanent=true', async () => {
		raw.mockResolvedValueOnce({ statusCode: 200, headers: {}, body: { object: 'deleted', id: 'f1' } });
		req.mockResolvedValueOnce({ object: 'deleted', id: 'f1', permanent: true });

		const items = await deleteWithTrash(makeCtx({ permanent: true }), 0, fileDelete);

		expect(raw).toHaveBeenCalledTimes(1);
		expect(req).toHaveBeenCalledTimes(1);
		expect(raw.mock.invocationCallOrder[0]).toBeLessThan(req.mock.invocationCallOrder[0]);
		expect(raw.mock.calls[0][1]).toEqual({ plane: 'regional', method: 'DELETE', path: '/v1/files/f1' });
		expect(req.mock.calls[0][1]).toEqual({ plane: 'regional', method: 'DELETE', path: '/v1/files/f1', qs: { permanent: true } });
		expect(items[0].json).toEqual({ object: 'deleted', id: 'f1', permanent: true });
	});

	it('ignores a 4xx from the trash call: an already-trashed item still deletes', async () => {
		raw.mockResolvedValueOnce({
			statusCode: 400,
			headers: {},
			body: { object: 'error', status: 400, code: 'invalid_request', message: 'Already in the trash' },
		});
		req.mockResolvedValueOnce({ object: 'deleted', id: 'f1', permanent: true });

		const items = await deleteWithTrash(makeCtx({ permanent: true }), 0, fileDelete);

		expect(req.mock.calls[0][1]).toMatchObject({ qs: { permanent: true } });
		expect(items[0].json).toMatchObject({ object: 'deleted' });
	});

	it('sends one plain DELETE when permanent is not set', async () => {
		req.mockResolvedValueOnce({ object: 'deleted', id: 'f1' });

		const items = await deleteWithTrash(makeCtx({}), 0, fileDelete);

		expect(raw).not.toHaveBeenCalled();
		expect(req).toHaveBeenCalledTimes(1);
		expect(req.mock.calls[0][1]).toEqual({ plane: 'regional', method: 'DELETE', path: '/v1/files/f1' });
		expect(items[0].json).toEqual({ object: 'deleted', id: 'f1' });
	});

	it('sends one plain DELETE when permanent is false', async () => {
		req.mockResolvedValueOnce({ object: 'deleted', id: 'f1' });

		await deleteWithTrash(makeCtx({ permanent: false }), 0, fileDelete);

		expect(raw).not.toHaveBeenCalled();
		expect(req.mock.calls[0][1]).toEqual({ plane: 'regional', method: 'DELETE', path: '/v1/files/f1' });
	});

	it('is the handler behind file.delete, folder.delete and page.delete', () => {
		for (const resource of [file, folder, page]) {
			const op = resource.operations.find((o) => o.operation === 'delete');
			expect(op?.custom).toBe(deleteWithTrash);
		}
	});
});
