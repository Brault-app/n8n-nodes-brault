import { createTransfer } from '../../nodes/Brault/actions/transfer-create';

// `toItems` (via run-operation.ts) also pulls `isListEnvelope` from this module, so a
// bare `{ braultRequest: jest.fn() }` mock leaves it undefined and breaks the real call.
// Keep the rest of the module real and mock only `braultRequest`.
jest.mock('../../nodes/Brault/transport/request', () => ({
	...jest.requireActual('../../nodes/Brault/transport/request'),
	braultRequest: jest.fn(),
}));
jest.mock('../../nodes/Brault/transport/binary', () => ({
	readBinarySource: jest.fn(async () => ({ source: Buffer.from('abc'), size: 3, fileName: 'a.txt', mimeType: 'text/plain' })),
	uploadWithSession: jest.fn(async () => ({ id: 'u1', status: 'completed' })),
}));

import { braultRequest } from '../../nodes/Brault/transport/request';
import { uploadWithSession } from '../../nodes/Brault/transport/binary';

const req = braultRequest as jest.Mock;
const spec = {
	resource: 'transfer',
	operation: 'create',
	name: 'Create',
	action: 'Create a transfer',
	description: 'x',
	method: 'POST',
	plane: 'regional',
	path: '/v1/transfers',
	// readValues() only reads the "additionalFields" collection when spec.fields is
	// non-empty; a placeholder entry (never inspected here, real shape comes from
	// transfer.ts) keeps that gate open for this handler-level test.
	fields: [{}],
} as never;
const ctx = {
	getNode: () => ({ name: 'Brault', type: 'n8n-nodes-brault.brault', typeVersion: 1, position: [0, 0], parameters: {} }),
	getNodeParameter: (n: string) => (n === 'additionalFields' ? { binaryProperties: 'data', file_ids: 'f1', expires_in_days: 3 } : undefined),
} as never;

beforeEach(() => { req.mockClear(); (uploadWithSession as jest.Mock).mockClear(); });

it('declares uploads, uploads each, then completes', async () => {
	req
		.mockResolvedValueOnce({ id: 't1', uploads: [{ id: 'u1', name: 'a.txt', size: 3, method: 'put', url: 'https://s3/put' }] })
		.mockResolvedValueOnce({ id: 't1', status: 'ready', url: 'https://brault.app/d/x' });
	const out = await createTransfer(ctx, 0, spec);
	expect(req.mock.calls[0][1]).toMatchObject({ method: 'POST', path: '/v1/transfers', body: { files: [{ id: 'f1' }], uploads: [{ name: 'a.txt', size: 3 }], expires_in_days: 3 } });
	expect((uploadWithSession as jest.Mock).mock.calls[0][3]).toEqual({ parts: '/v1/transfers/t1/uploads/u1/parts', complete: '/v1/transfers/t1/uploads/u1/complete' });
	expect(req.mock.calls[1][1]).toMatchObject({ path: '/v1/transfers/t1/complete' });
	expect(out[0].json).toMatchObject({ id: 't1', status: 'ready' });
});

it('returns the transfer directly when no binaries are attached (the API creates it without a draft)', async () => {
	req.mockResolvedValueOnce({ id: 't2', status: 'ready', uploads: [] });
	const noBinaryCtx = {
		getNodeParameter: (n: string) => (n === 'additionalFields' ? { file_ids: 'f1', folder_ids: 'fo1' } : undefined),
	} as never;
	const out = await createTransfer(noBinaryCtx, 0, spec);
	expect(req.mock.calls[0][1]).toMatchObject({ body: { files: [{ id: 'f1' }], folders: ['fo1'] } });
	expect(req.mock.calls[0][1].body.uploads).toBeUndefined();
	expect(req.mock.calls).toHaveLength(1);
	expect(out[0].json).toMatchObject({ id: 't2', status: 'ready' });
});

it('fails fast when Brault accepts fewer uploads than binaries were attached', async () => {
	req.mockResolvedValueOnce({ id: 't3', uploads: [] });
	await expect(createTransfer(ctx, 0, spec)).rejects.toThrow(/accepted 0 of 1 uploads/);
	expect(uploadWithSession).not.toHaveBeenCalled();
	expect(req.mock.calls.some((c: unknown[]) => String((c[1] as { path: string }).path).endsWith('/complete'))).toBe(false);
});
