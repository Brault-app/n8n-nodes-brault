import { BraultTrigger } from '../../nodes/BraultTrigger/BraultTrigger.node';
jest.mock('../../nodes/Brault/transport/request', () => ({ braultRequest: jest.fn(), braultRequestRaw: jest.fn() }));
import { braultRequest, braultRequestRaw } from '../../nodes/Brault/transport/request';
const req = braultRequest as jest.Mock;
const raw = braultRequestRaw as jest.Mock;

function hookCtx(staticData: Record<string, unknown>, params: Record<string, unknown> = { events: ['file.created'] }) {
	return {
		getWorkflowStaticData: () => staticData,
		getNodeWebhookUrl: () => 'https://n8n.example/webhook/abc',
		getWorkflow: () => ({ name: 'My flow' }),
		getNodeParameter: (n: string) => params[n],
		getNode: () => ({ name: 'Brault Trigger' }),
	} as never;
}
const node = new BraultTrigger();
const hooks = node.webhookMethods.default;

describe('Brault Trigger lifecycle', () => {
	beforeEach(() => {
		req.mockReset();
		raw.mockReset();
	});
	it('create registers the endpoint and stores id + secret', async () => {
		req.mockResolvedValueOnce({ id: 'wh_1', secret: 's3cret' });
		const sd: Record<string, unknown> = {};
		await expect(hooks.create.call(hookCtx(sd))).resolves.toBe(true);
		expect(req.mock.calls[0][1]).toMatchObject({
			method: 'POST',
			path: '/v1/webhooks',
			plane: 'regional',
			idempotent: true,
			body: { url: 'https://n8n.example/webhook/abc', name: 'n8n · My flow', events: ['file.created'] },
		});
		expect(sd).toEqual({ webhookId: 'wh_1', secret: 's3cret' });
	});
	it('checkExists is true only when the stored endpoint has our URL', async () => {
		raw.mockResolvedValueOnce({ statusCode: 200, headers: {}, body: { data: { id: 'wh_1', url: 'https://n8n.example/webhook/abc' } } });
		await expect(hooks.checkExists.call(hookCtx({ webhookId: 'wh_1', secret: 's' }))).resolves.toBe(true);
		raw.mockResolvedValueOnce({ statusCode: 200, headers: {}, body: { data: { id: 'wh_1', url: 'https://other' } } });
		const sd: Record<string, unknown> = { webhookId: 'wh_1', secret: 's' };
		await expect(hooks.checkExists.call(hookCtx(sd))).resolves.toBe(false);
		expect(sd).toEqual({});
	});
	it('delete ignores 404 and clears static data', async () => {
		raw.mockResolvedValueOnce({ statusCode: 404, headers: {}, body: {} });
		const sd: Record<string, unknown> = { webhookId: 'wh_1', secret: 's' };
		await expect(hooks.delete.call(hookCtx(sd))).resolves.toBe(true);
		expect(sd).toEqual({});
	});
});
