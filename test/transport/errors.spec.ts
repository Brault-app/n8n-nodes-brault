import { parseErrorBody, friendlyMessage } from '../../nodes/Brault/transport/errors';

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
