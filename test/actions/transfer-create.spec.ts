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
	getNodeParameter: (n: string) => (n === 'additionalFields' ? { binaryProperties: 'data', file_ids: 'f1', expires_in_days: 3 } : undefined),
} as never;

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

it('completes with no declared uploads even when zero binary properties are sent', async () => {
	req.mockResolvedValueOnce({ id: 't2', uploads: [] }).mockResolvedValueOnce({ id: 't2', status: 'ready' });
	const noBinaryCtx = {
		getNodeParameter: (n: string) => (n === 'additionalFields' ? { file_ids: 'f1', folder_ids: 'fo1' } : undefined),
	} as never;
	const out = await createTransfer(noBinaryCtx, 0, spec);
	expect(req.mock.calls[2][1]).toMatchObject({ body: { files: [{ id: 'f1' }], folders: ['fo1'] } });
	expect(req.mock.calls[2][1].body.uploads).toBeUndefined();
	expect(req.mock.calls[3][1]).toMatchObject({ path: '/v1/transfers/t2/complete' });
	expect(out[0].json).toMatchObject({ id: 't2', status: 'ready' });
});
