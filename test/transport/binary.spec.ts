import { chunkSource, uploadWithSession } from '../../nodes/Brault/transport/binary';
jest.mock('../../nodes/Brault/transport/request', () => ({ braultRequest: jest.fn() }));
import { braultRequest } from '../../nodes/Brault/transport/request';
const req = braultRequest as jest.Mock;

async function collect(gen: AsyncGenerator<Buffer>) {
	const out: Buffer[] = [];
	for await (const c of gen) out.push(c);
	return out;
}

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
	it('re-chunks a single 12-byte stream chunk at partSize 4 into three 4-byte parts', async () => {
		const stream = fakeStream([Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])]);
		const parts = await collect(chunkSource(stream, 4));
		expect(parts.map((p) => p.length)).toEqual([4, 4, 4]);
	});
	it('throws for a non-positive partSize', async () => {
		await expect(collect(chunkSource(Buffer.alloc(4), 0))).rejects.toThrow();
		await expect(collect(chunkSource(Buffer.alloc(4), -1))).rejects.toThrow();
	});
});

describe('uploadWithSession', () => {
	const httpRequest = jest.fn(async () => ({ headers: { etag: '"e1"' }, body: '' })) as jest.Mock;
	const ctx = { helpers: { httpRequest }, getNode: () => ({ name: 'Brault' }) } as never;
	beforeEach(() => {
		req.mockReset();
		httpRequest.mockClear();
		httpRequest.mockResolvedValue({ headers: { etag: '"e1"' }, body: '' });
	});

	it('PUTs the whole body for method put and completes without parts', async () => {
		req.mockResolvedValueOnce({ id: 'f1' });
		await expect(
			uploadWithSession(
				ctx,
				{ id: 'up', method: 'put', upload_url: 'https://s3/put' },
				Buffer.from('abc'),
				{ parts: '/v1/uploads/up/parts', complete: '/v1/uploads/up/complete', abort: '/v1/uploads/up/abort' },
			),
		).resolves.toEqual({ id: 'f1' });
		expect(httpRequest.mock.calls[0][0]).toMatchObject({ method: 'PUT', url: 'https://s3/put' });
		expect(req.mock.calls[0][1]).toMatchObject({ method: 'POST', path: '/v1/uploads/up/complete', body: {} });
	});

	it('uses session.content_type for the single-PUT Content-Type header', async () => {
		req.mockResolvedValueOnce({ id: 'f1' });
		await uploadWithSession(
			ctx,
			{ id: 'up', method: 'put', upload_url: 'https://s3/put', content_type: 'image/png' },
			Buffer.from('abc'),
			{ parts: '/v1/uploads/up/parts', complete: '/v1/uploads/up/complete' },
		);
		expect(httpRequest.mock.calls[0][0]).toMatchObject({ headers: expect.objectContaining({ 'Content-Type': 'image/png' }) });
	});

	it('falls back to meta.mimeType when session.content_type is absent', async () => {
		req.mockResolvedValueOnce({ id: 'f1' });
		await uploadWithSession(
			ctx,
			{ id: 'up', method: 'put', upload_url: 'https://s3/put' },
			Buffer.from('abc'),
			{ parts: '/v1/uploads/up/parts', complete: '/v1/uploads/up/complete' },
			{ mimeType: 'text/plain' },
		);
		expect(httpRequest.mock.calls[0][0]).toMatchObject({ headers: expect.objectContaining({ 'Content-Type': 'text/plain' }) });
	});

	it('sets Content-Length from meta.size for a stream source', async () => {
		req.mockResolvedValueOnce({ id: 'f1' });
		const stream = fakeStream([Buffer.from('abc')]);
		await uploadWithSession(
			ctx,
			{ id: 'up', method: 'put', upload_url: 'https://s3/put' },
			stream,
			{ parts: '/v1/uploads/up/parts', complete: '/v1/uploads/up/complete' },
			{ size: 3 },
		);
		expect(httpRequest.mock.calls[0][0]).toMatchObject({ headers: expect.objectContaining({ 'Content-Length': '3' }) });
	});

	it('uploads parts and completes with etags for multipart, using each part upload_url and exact byte ranges', async () => {
		req
			.mockResolvedValueOnce({ parts: [{ part_number: 1, upload_url: 'https://s3/1' }] })
			.mockResolvedValueOnce({ parts: [{ part_number: 2, upload_url: 'https://s3/2' }] })
			.mockResolvedValueOnce({ id: 'f1' });
		await uploadWithSession(ctx, { id: 'up', method: 'multipart', part_size: 4 }, Buffer.from([1, 2, 3, 4, 5, 6]), {
			parts: '/v1/uploads/up/parts',
			complete: '/v1/uploads/up/complete',
		});
		expect(req.mock.calls[2][1].body).toEqual({
			parts: [
				{ part_number: 1, etag: 'e1' },
				{ part_number: 2, etag: 'e1' },
			],
		});
		expect(req.mock.calls[0][1]).toMatchObject({ body: { part_numbers: [1] } });
		expect(req.mock.calls[1][1]).toMatchObject({ body: { part_numbers: [2] } });
		expect(httpRequest.mock.calls[0][0]).toMatchObject({ url: 'https://s3/1', body: Buffer.from([1, 2, 3, 4]) });
		expect(httpRequest.mock.calls[1][0]).toMatchObject({ url: 'https://s3/2', body: Buffer.from([5, 6]) });
	});

	it('never sends an Authorization header on a PUT', async () => {
		req
			.mockResolvedValueOnce({ parts: [{ part_number: 1, upload_url: 'https://s3/1' }] })
			.mockResolvedValueOnce({ parts: [{ part_number: 2, upload_url: 'https://s3/2' }] })
			.mockResolvedValueOnce({ id: 'f1' });
		await uploadWithSession(ctx, { id: 'up', method: 'multipart', part_size: 4 }, Buffer.from([1, 2, 3, 4, 5, 6]), {
			parts: '/v1/uploads/up/parts',
			complete: '/v1/uploads/up/complete',
		});
		for (const call of httpRequest.mock.calls) {
			const headers = (call[0] as { headers?: Record<string, string> }).headers ?? {};
			expect(Object.keys(headers).map((h) => h.toLowerCase())).not.toContain('authorization');
		}
	});

	it('throws naming the part number when a part PUT returns no ETag', async () => {
		req.mockResolvedValueOnce({ parts: [{ part_number: 1, upload_url: 'https://s3/1' }] }).mockResolvedValueOnce({
			parts: [{ part_number: 2, upload_url: 'https://s3/2' }],
		});
		httpRequest
			.mockResolvedValueOnce({ headers: { etag: '"e1"' }, body: '' })
			.mockResolvedValueOnce({ headers: {}, body: '' });
		await expect(
			uploadWithSession(ctx, { id: 'up', method: 'multipart', part_size: 4 }, Buffer.from([1, 2, 3, 4, 5, 6]), {
				parts: '/v1/uploads/up/parts',
				complete: '/v1/uploads/up/complete',
			}),
		).rejects.toThrow('Part 2 upload returned no ETag');
	});

	it('aborts and rethrows when a part fails', async () => {
		httpRequest.mockRejectedValueOnce(new Error('s3 down'));
		req.mockResolvedValueOnce({ parts: [{ part_number: 1, upload_url: 'https://s3/1' }] }).mockResolvedValueOnce({});
		await expect(
			uploadWithSession(
				ctx,
				{ id: 'up', method: 'multipart', part_size: 4 },
				Buffer.alloc(6),
				{ parts: '/v1/uploads/up/parts', complete: '/v1/uploads/up/complete', abort: '/v1/uploads/up/abort' },
			),
		).rejects.toThrow('s3 down');
		expect(req.mock.calls[1][1]).toMatchObject({ path: '/v1/uploads/up/abort' });
	});

	it('preserves the description of a braultRequest rejection through the abort/rethrow', async () => {
		// The rejection must come from a call the function actually `await`s inside the
		// `try` (here: the multipart parts request) — a rejection from the un-awaited
		// `return braultRequest(...)` on the `complete` call bypasses the catch entirely
		// and would pass this assertion even with a broken rethrow, so it wouldn't
		// exercise the fix.
		const apiError = new Error('rate limited') as Error & { description?: string };
		apiError.description = 'insufficient_scope · request_id abc123';
		req.mockRejectedValueOnce(apiError);
		let caught: (Error & { description?: string }) | undefined;
		try {
			await uploadWithSession(ctx, { id: 'up', method: 'multipart', part_size: 4 }, Buffer.from([1, 2, 3, 4, 5, 6]), {
				parts: '/v1/uploads/up/parts',
				complete: '/v1/uploads/up/complete',
			});
		} catch (e) {
			caught = e as Error & { description?: string };
		}
		expect(caught).toBeDefined();
		expect(caught?.message).toBe('rate limited');
		expect(caught?.description).toBe('insufficient_scope · request_id abc123');
	});
});
