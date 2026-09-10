import { chunkSource, uploadWithSession } from '../../nodes/Brault/transport/binary';
jest.mock('../../nodes/Brault/transport/request', () => ({ braultRequest: jest.fn() }));
import { braultRequest } from '../../nodes/Brault/transport/request';
const req = braultRequest as jest.Mock;

async function collect(gen: AsyncGenerator<Buffer>) { const out: Buffer[] = []; for await (const c of gen) out.push(c); return out; }

// A plain async generator stands in for a Node `Readable`: it satisfies the same
// `for await` contract chunkSource relies on, without importing the `stream` module
// (disallowed for community nodes by n8n-node lint's Cloud-compatibility check).
function fakeStream(chunks: Buffer[]): NodeJS.ReadableStream {
	async function* gen() {
		for (const c of chunks) yield c;
	}
	return gen() as unknown as NodeJS.ReadableStream;
}

describe('chunkSource', () => {
	it('re-chunks a stream into exact part sizes with a short tail', async () => {
		const stream = fakeStream([Buffer.alloc(3, 1), Buffer.alloc(4, 2), Buffer.alloc(3, 3)]);
		const parts = await collect(chunkSource(stream, 4));
		expect(parts.map((p) => p.length)).toEqual([4, 4, 2]);
	});
	it('slices a buffer', async () => {
		expect((await collect(chunkSource(Buffer.alloc(10), 4))).map((p) => p.length)).toEqual([4, 4, 2]);
	});
});

describe('uploadWithSession', () => {
	const httpRequest = jest.fn(async () => ({ headers: { etag: '"e1"' }, body: '' })) as jest.Mock;
	const ctx = { helpers: { httpRequest }, getNode: () => ({ name: 'Brault' }) } as never;
	beforeEach(() => { req.mockReset(); httpRequest.mockClear(); });
	it('PUTs the whole body for method put and completes without parts', async () => {
		req.mockResolvedValueOnce({ id: 'f1' });
		await expect(uploadWithSession(ctx, { id: 'up', method: 'put', upload_url: 'https://s3/put' }, Buffer.from('abc'), { parts: '/v1/uploads/up/parts', complete: '/v1/uploads/up/complete', abort: '/v1/uploads/up/abort' })).resolves.toEqual({ id: 'f1' });
		expect(httpRequest.mock.calls[0][0]).toMatchObject({ method: 'PUT', url: 'https://s3/put' });
		expect(req.mock.calls[0][1]).toMatchObject({ method: 'POST', path: '/v1/uploads/up/complete', body: {} });
	});
	it('uploads parts and completes with etags for multipart', async () => {
		req.mockResolvedValueOnce({ parts: [{ part_number: 1, upload_url: 'https://s3/1' }] }).mockResolvedValueOnce({ parts: [{ part_number: 2, upload_url: 'https://s3/2' }] }).mockResolvedValueOnce({ id: 'f1' });
		await uploadWithSession(ctx, { id: 'up', method: 'multipart', part_size: 4 }, Buffer.alloc(6), { parts: '/v1/uploads/up/parts', complete: '/v1/uploads/up/complete' });
		expect(req.mock.calls[2][1].body).toEqual({ parts: [{ part_number: 1, etag: 'e1' }, { part_number: 2, etag: 'e1' }] });
	});
	it('aborts and rethrows when a part fails', async () => {
		httpRequest.mockRejectedValueOnce(new Error('s3 down'));
		req.mockResolvedValueOnce({ parts: [{ part_number: 1, upload_url: 'https://s3/1' }] }).mockResolvedValueOnce({});
		await expect(uploadWithSession(ctx, { id: 'up', method: 'multipart', part_size: 4 }, Buffer.alloc(6), { parts: '/v1/uploads/up/parts', complete: '/v1/uploads/up/complete', abort: '/v1/uploads/up/abort' })).rejects.toThrow('s3 down');
		expect(req.mock.calls[1][1]).toMatchObject({ path: '/v1/uploads/up/abort' });
	});
});
