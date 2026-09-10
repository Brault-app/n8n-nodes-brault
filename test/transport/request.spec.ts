import { braultRequest } from '../../nodes/Brault/transport/request';
import { clearHostsCache } from '../../nodes/Brault/transport/hosts';

type Call = { method: string; url: string; headers?: Record<string, string>; qs?: unknown; body?: unknown };
function ctx(responses: Array<{ statusCode: number; body?: unknown; headers?: Record<string, string> }>) {
	const calls: Call[] = [];
	const httpRequestWithAuthentication = jest.fn(async (_c: string, o: Call) => {
		calls.push(o);
		return { headers: {}, ...responses.shift() };
	});
	return {
		calls,
		getNode: () => ({ name: 'Brault', type: 'n8n-nodes-brault.brault', typeVersion: 1, position: [0, 0], parameters: {} }),
		getCredentials: async () => ({ apiKey: 'bsk_us_abcdefgh_x', baseUrl: 'https://api.stg.brault.app' }),
		helpers: { httpRequestWithAuthentication },
	} as never;
}
const me = { statusCode: 200, body: { data: { hosts: { central: 'https://central', regional: 'https://regional' } } } };

describe('braultRequest', () => {
	beforeEach(() => clearHostsCache());

	it('routes regional calls to the regional host and unwraps data', async () => {
		const c = ctx([me, { statusCode: 200, body: { data: { id: 'lib_1' } } }]);
		await expect(braultRequest(c, { plane: 'regional', method: 'GET', path: '/v1/libraries/lib_1' })).resolves.toEqual({ id: 'lib_1' });
		expect((c as never as { calls: Call[] }).calls[1].url).toBe('https://regional/v1/libraries/lib_1');
	});

	it('keeps list envelopes whole', async () => {
		const c = ctx([me, { statusCode: 200, body: { object: 'list', data: [{ id: 1 }], has_more: false, next_cursor: null } }]);
		await expect(braultRequest(c, { plane: 'central', method: 'GET', path: '/v1/members' })).resolves.toMatchObject({
			object: 'list',
			has_more: false,
		});
	});

	it('adds Idempotency-Key on creating POSTs', async () => {
		const c = ctx([me, { statusCode: 201, body: { data: { id: 'x' } } }]);
		await braultRequest(c, { plane: 'regional', method: 'POST', path: '/v1/libraries', body: { name: 'A' }, idempotent: true });
		const h = (c as never as { calls: Call[] }).calls[1].headers ?? {};
		expect(h['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/);
	});

	it('retries once on 429 with a short Retry-After', async () => {
		const c = ctx([
			me,
			{ statusCode: 429, headers: { 'retry-after': '0' }, body: { error: { code: 'rate_limited', message: 'slow down', status: 429 } } },
			{ statusCode: 200, body: { data: { ok: true } } },
		]);
		await expect(braultRequest(c, { plane: 'regional', method: 'GET', path: '/v1/files' })).resolves.toEqual({ ok: true });
	});

	it('throws NodeApiError with code and request id', async () => {
		const c = ctx([me, { statusCode: 404, body: { error: { code: 'not_found', message: 'No such file', status: 404, request_id: 'req_9' } } }]);
		await expect(braultRequest(c, { plane: 'regional', method: 'GET', path: '/v1/files/nope' })).rejects.toMatchObject({
			message: expect.stringContaining('No such file'),
			description: expect.stringContaining('req_9'),
		});
	});

	it('does not retry a 429 whose Retry-After exceeds the 10s cap', async () => {
		const c = ctx([
			me,
			{ statusCode: 429, headers: { 'retry-after': '30' }, body: { error: { code: 'rate_limited', message: 'slow down', status: 429 } } },
		]);
		await expect(braultRequest(c, { plane: 'regional', method: 'GET', path: '/v1/files' })).rejects.toMatchObject({
			httpCode: '429',
			description: expect.stringContaining('Retry-After 30s'),
		});
		// one call to resolve hosts + one request call: no retry was attempted
		expect((c as never as { calls: Call[] }).calls.length).toBe(2);
	});

	it('does not retry a 429 whose Retry-After is not a finite number', async () => {
		const c = ctx([
			me,
			{
				statusCode: 429,
				headers: { 'retry-after': 'Wed, 21 Oct 2026 07:28:00 GMT' },
				body: { error: { code: 'rate_limited', message: 'slow down', status: 429 } },
			},
		]);
		await expect(braultRequest(c, { plane: 'regional', method: 'GET', path: '/v1/files' })).rejects.toMatchObject({ httpCode: '429' });
		expect((c as never as { calls: Call[] }).calls.length).toBe(2);
	});

	it('does not retry a 429 with no Retry-After header at all', async () => {
		const c = ctx([me, { statusCode: 429, body: { error: { code: 'rate_limited', message: 'slow down', status: 429 } } }]);
		await expect(braultRequest(c, { plane: 'regional', method: 'GET', path: '/v1/files' })).rejects.toMatchObject({ httpCode: '429' });
		expect((c as never as { calls: Call[] }).calls.length).toBe(2);
	});

	it('retries exactly once even if the retry itself comes back 429', async () => {
		const rateLimited = { statusCode: 429, headers: { 'retry-after': '0' }, body: { error: { code: 'rate_limited', message: 'slow down', status: 429 } } };
		const c = ctx([me, rateLimited, rateLimited]);
		await expect(braultRequest(c, { plane: 'regional', method: 'GET', path: '/v1/files' })).rejects.toMatchObject({ httpCode: '429' });
		// one call to resolve hosts + exactly two request calls (the original attempt and one retry)
		expect((c as never as { calls: Call[] }).calls.length).toBe(3);
	});

	it('resolves an empty object for a 204 with an empty string body', async () => {
		const c = ctx([me, { statusCode: 204, body: '' }]);
		await expect(braultRequest(c, { plane: 'regional', method: 'DELETE', path: '/v1/files/1' })).resolves.toEqual({});
	});

	it('resolves an empty object for a 200 with an empty string body', async () => {
		const c = ctx([me, { statusCode: 200, body: '' }]);
		await expect(braultRequest(c, { plane: 'regional', method: 'GET', path: '/v1/files/1' })).resolves.toEqual({});
	});
});
