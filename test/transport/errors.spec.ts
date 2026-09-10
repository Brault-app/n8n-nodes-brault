import { parseErrorBody, friendlyMessage, toNodeApiError } from '../../nodes/Brault/transport/errors';

describe('parseErrorBody', () => {
	it('reads the v1 error envelope', () => {
		const info = parseErrorBody(
			{
				error: {
					object: 'error',
					status: 403,
					code: 'insufficient_scope',
					message: 'Missing scope',
					request_id: 'req_1',
					details: { required: 'files:write' },
				},
			},
			403,
		);
		expect(info).toMatchObject({ code: 'insufficient_scope', message: 'Missing scope', requestId: 'req_1', status: 403 });
	});

	it('handles a non-JSON body', () => {
		expect(parseErrorBody('<html>', 502)).toMatchObject({ code: 'http_502', status: 502 });
	});

	it('handles an undefined body', () => {
		expect(parseErrorBody(undefined, 500)).toMatchObject({ code: 'http_500', status: 500 });
	});
});

describe('friendlyMessage', () => {
	it('explains the webhook limit', () => {
		expect(
			friendlyMessage({ code: 'invalid_request', message: 'x', status: 400, details: { reason: 'webhook_limit_reached', max: 5 } }),
		).toContain('5 webhook endpoints');
	});

	it('names the missing scope', () => {
		expect(friendlyMessage({ code: 'insufficient_scope', message: 'x', status: 403, details: { required: 'files:write' } })).toContain(
			'files:write',
		);
	});

	it('points at the right host on 421', () => {
		expect(
			friendlyMessage({ code: 'misdirected_request', message: 'x', status: 421, details: { host: 'https://eu.api.brault.app' } }),
		).toContain('eu.api.brault.app');
	});
});

describe('toNodeApiError', () => {
	const node = { name: 'Brault', type: 'n8n-nodes-brault.brault', typeVersion: 1, position: [0, 0], parameters: {} } as never;

	it('appends the s suffix to a numeric Retry-After value', () => {
		const err = toNodeApiError(node, {
			statusCode: 429,
			headers: { 'retry-after': '30' },
			body: { error: { code: 'rate_limited', message: 'slow down', status: 429 } },
		});
		expect(err.description).toContain('Retry-After 30s');
	});

	it('keeps a non-numeric Retry-After value raw, without an s suffix', () => {
		const err = toNodeApiError(node, {
			statusCode: 429,
			headers: { 'retry-after': 'Wed, 21 Oct 2026 07:28:00 GMT' },
			body: { error: { code: 'rate_limited', message: 'slow down', status: 429 } },
		});
		expect(err.description).toContain('Retry-After Wed, 21 Oct 2026 07:28:00 GMT');
		expect(err.description).not.toContain('GMTs');
	});
});
