import { createHmac } from 'crypto';
import { BraultTrigger } from '../../nodes/BraultTrigger/BraultTrigger.node';

function sign(secret: string, raw: string, t: number = Math.floor(Date.now() / 1000)): string {
	const hmac = createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex');
	return `t=${t},v1=${hmac}`;
}

function webhookCtx(opts: {
	rawBody?: Buffer;
	body: Record<string, unknown>;
	headers?: Record<string, string>;
	options?: Record<string, unknown>;
	staticData?: Record<string, unknown>;
}) {
	const statusCalls: number[] = [];
	const jsonMock = jest.fn();
	const responseObject = {
		status: jest.fn((code: number) => {
			statusCalls.push(code);
			return { json: jsonMock };
		}),
	};
	const ctx = {
		getRequestObject: () => ({ rawBody: opts.rawBody, body: opts.body }),
		getHeaderData: () => opts.headers ?? {},
		getNodeParameter: () => opts.options ?? {},
		getWorkflowStaticData: () => opts.staticData ?? {},
		getResponseObject: () => responseObject,
		helpers: {
			returnJsonArray: (x: unknown) => [{ json: x }],
		},
	} as never;
	return { ctx, responseObject, jsonMock, statusCalls };
}

const node = new BraultTrigger();

describe('Brault Trigger webhook()', () => {
	it('emits the body when the signature is valid', async () => {
		const secret = 's3cret';
		const body = { hello: 'world' };
		const raw = JSON.stringify(body);
		const header = sign(secret, raw);
		const { ctx, responseObject } = webhookCtx({
			rawBody: Buffer.from(raw),
			body,
			headers: { 'brault-signature': header },
			staticData: { webhookId: 'wh_1', secret },
		});
		const result = await node.webhook.call(ctx);
		expect(result).toEqual({ workflowData: [[{ json: body }]] });
		expect(body).toEqual({ hello: 'world' });
		expect(responseObject.status).not.toHaveBeenCalled();
	});

	it('rejects a tampered body with 401', async () => {
		const secret = 's3cret';
		const body = { hello: 'world' };
		const raw = JSON.stringify(body);
		const header = sign(secret, raw);
		const tamperedBody = { hello: 'tampered' };
		const { ctx, statusCalls, jsonMock } = webhookCtx({
			rawBody: Buffer.from(JSON.stringify(tamperedBody)),
			body: tamperedBody,
			headers: { 'brault-signature': header },
			staticData: { webhookId: 'wh_1', secret },
		});
		const result = await node.webhook.call(ctx);
		expect(statusCalls).toEqual([401]);
		expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));
		expect(result).toEqual({ noWebhookResponse: true });
	});

	it('rejects a missing Brault-Signature header with 401', async () => {
		const body = { hello: 'world' };
		const { ctx, statusCalls, jsonMock } = webhookCtx({
			rawBody: Buffer.from(JSON.stringify(body)),
			body,
			headers: {},
			staticData: { webhookId: 'wh_1', secret: 's3cret' },
		});
		const result = await node.webhook.call(ctx);
		expect(statusCalls).toEqual([401]);
		expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));
		expect(result).toEqual({ noWebhookResponse: true });
	});

	it('emits the body when verifySignature option is false and no header is present', async () => {
		const body = { hello: 'world' };
		const { ctx, responseObject } = webhookCtx({
			rawBody: Buffer.from(JSON.stringify(body)),
			body,
			headers: {},
			options: { verifySignature: false },
			staticData: { webhookId: 'wh_1', secret: 's3cret' },
		});
		const result = await node.webhook.call(ctx);
		expect(result).toEqual({ workflowData: [[{ json: body }]] });
		expect(responseObject.status).not.toHaveBeenCalled();
	});

	it('fails closed with 401 when the endpoint secret is missing from static data', async () => {
		const secret = 's3cret';
		const body = { hello: 'world' };
		const raw = JSON.stringify(body);
		// A valid-looking signature computed with a secret the server no longer has on file.
		const header = sign(secret, raw);
		const { ctx, statusCalls, jsonMock } = webhookCtx({
			rawBody: Buffer.from(raw),
			body,
			headers: { 'brault-signature': header },
			staticData: { webhookId: 'wh_1' },
		});
		const result = await node.webhook.call(ctx);
		expect(statusCalls).toEqual([401]);
		expect(jsonMock).toHaveBeenCalledWith({
			error: 'signature unverifiable: endpoint secret missing, deactivate and reactivate the workflow',
		});
		expect(result).toEqual({ noWebhookResponse: true });
	});

	it('falls back to JSON.stringify(body) when rawBody is absent', async () => {
		const secret = 's3cret';
		const body = { hello: 'world' };
		const raw = JSON.stringify(body);
		const header = sign(secret, raw);
		const { ctx, responseObject } = webhookCtx({
			rawBody: undefined,
			body,
			headers: { 'brault-signature': header },
			staticData: { webhookId: 'wh_1', secret },
		});
		const result = await node.webhook.call(ctx);
		expect(result).toEqual({ workflowData: [[{ json: body }]] });
		expect(responseObject.status).not.toHaveBeenCalled();
	});
});
