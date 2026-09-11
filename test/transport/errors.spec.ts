import { parseErrorBody, friendlyMessage, toNodeApiError } from '../../nodes/Brault/transport/errors';

describe('parseErrorBody', () => {
	it('reads the flat v1 error envelope', () => {
		const info = parseErrorBody(
			{
				object: 'error',
				status: 403,
				code: 'insufficient_scope',
				message: 'Missing scope',
				request_id: 'req_1',
				details: { required: 'files:write' },
			},
			403,
		);
		expect(info).toMatchObject({ code: 'insufficient_scope', message: 'Missing scope', requestId: 'req_1', status: 403 });
		expect(info.details).toEqual({ required: 'files:write' });
	});

	it('still reads a legacy nested error envelope', () => {
		const info = parseErrorBody(
			{ error: { object: 'error', status: 404, code: 'not_found', message: 'No such file', request_id: 'req_2' } },
			404,
		);
		expect(info).toMatchObject({ code: 'not_found', message: 'No such file', requestId: 'req_2', status: 404 });
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

	it('appends the field reasons a validation error carries in details.errors', () => {
		const info = parseErrorBody(
			{
				object: 'error',
				status: 400,
				code: 'validation_error',
				message: 'The request body or query is invalid.',
				request_id: 'req_3',
				details: { errors: [{ field: null, reason: 'Give exactly one of library_id, folder_id, file_id.' }] },
			},
			400,
		);
		expect(friendlyMessage(info)).toBe(
			'The request body or query is invalid. Give exactly one of library_id, folder_id, file_id.',
		);
	});

	it('ignores a details.errors entry without a reason string', () => {
		expect(
			friendlyMessage({
				code: 'validation_error',
				message: 'Invalid',
				status: 400,
				details: { errors: [{ field: 'name' }] },
			}),
		).toBe('Invalid');
	});
});

describe('toNodeApiError', () => {
	const node = { name: 'Brault', type: 'n8n-nodes-brault.brault', typeVersion: 1, position: [0, 0], parameters: {} } as never;

	it('carries code and request_id from a flat error body into the description', () => {
		const err = toNodeApiError(node, {
			statusCode: 400,
			headers: {},
			body: {
				object: 'error',
				status: 400,
				code: 'validation_error',
				message: 'The request body or query is invalid.',
				request_id: 'req_7',
				details: { errors: [{ field: null, reason: 'Give exactly one of library_id, folder_id, file_id.' }] },
			},
		});
		expect(err.description).toBe('validation_error · request_id req_7');
		expect(err.message).toContain('Give exactly one of library_id, folder_id, file_id.');
	});

	it('appends the s suffix to a numeric Retry-After value', () => {
		const err = toNodeApiError(node, {
			statusCode: 429,
			headers: { 'retry-after': '30' },
			body: { object: 'error', code: 'rate_limited', message: 'slow down', status: 429 },
		});
		expect(err.description).toContain('Retry-After 30s');
	});

	it('keeps a non-numeric Retry-After value raw, without an s suffix', () => {
		const err = toNodeApiError(node, {
			statusCode: 429,
			headers: { 'retry-after': 'Wed, 21 Oct 2026 07:28:00 GMT' },
			body: { object: 'error', code: 'rate_limited', message: 'slow down', status: 429 },
		});
		expect(err.description).toContain('Retry-After Wed, 21 Oct 2026 07:28:00 GMT');
		expect(err.description).not.toContain('GMTs');
	});
});
