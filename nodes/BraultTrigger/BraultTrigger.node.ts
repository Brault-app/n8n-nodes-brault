import type {
	IDataObject,
	IHookFunctions,
	ILoadOptionsFunctions,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
	IWebhookFunctions,
	IWebhookResponseData,
} from 'n8n-workflow';
import { NodeConnectionTypes } from 'n8n-workflow';
import { braultRequest, braultRequestRaw, type ListEnvelope } from '../Brault/transport/request';
import { verifySignature } from './signature';

interface TriggerStaticData {
	webhookId?: string;
	secret?: string;
}

export class BraultTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Brault Trigger',
		name: 'braultTrigger',
		icon: { light: 'file:brault.svg', dark: 'file:brault.dark.svg' },
		group: ['trigger'],
		version: 1,
		subtitle: '={{$parameter["events"].join(", ")}}',
		description: 'Starts the workflow when something happens in Brault (file uploaded, comment added, transfer downloaded)',
		defaults: { name: 'Brault Trigger' },
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'braultApi', required: true }],
		webhooks: [{ name: 'default', httpMethod: 'POST', responseMode: 'onReceived', path: 'webhook' }],
		properties: [
			{
				displayName: 'Event Names or IDs',
				name: 'events',
				type: 'multiOptions',
				typeOptions: { loadOptionsMethod: 'getEvents' },
				required: true,
				default: [],
				description:
					'Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add option',
				default: {},
				options: [
					{
						displayName: 'Verify Signature',
						name: 'verifySignature',
						type: 'boolean',
						default: true,
						description: 'Whether to reject deliveries whose Brault-Signature header does not match the endpoint secret',
					},
				],
			},
		],
	};

	methods = {
		loadOptions: {
			async getEvents(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const res = await braultRequest<ListEnvelope<{ type: string; description?: string }>>(this, {
					plane: 'central',
					method: 'GET',
					path: '/v1/events',
				});
				const options = res.data.map((e) => ({ name: e.type, value: e.type, description: e.description }));
				return [{ name: 'All Events', value: '*', description: 'Every event in the catalogue' }, ...options];
			},
		},
	};

	webhookMethods = {
		default: {
			async checkExists(this: IHookFunctions): Promise<boolean> {
				const sd = this.getWorkflowStaticData('node') as TriggerStaticData;
				if (!sd.webhookId) return false;
				const res = await braultRequestRaw(this, { plane: 'regional', method: 'GET', path: `/v1/webhooks/${sd.webhookId}` });
				const url = (res.body as { data?: { url?: string } } | undefined)?.data?.url;
				if (res.statusCode === 200 && url === this.getNodeWebhookUrl('default')) return true;
				delete sd.webhookId;
				delete sd.secret;
				return false;
			},
			async create(this: IHookFunctions): Promise<boolean> {
				const sd = this.getWorkflowStaticData('node') as TriggerStaticData;
				const events = this.getNodeParameter('events') as string[];
				const name = `n8n · ${this.getWorkflow().name ?? 'workflow'}`.slice(0, 80);
				const created = await braultRequest<{ id: string; secret: string }>(this, {
					plane: 'regional',
					method: 'POST',
					path: '/v1/webhooks',
					idempotent: true,
					body: { url: this.getNodeWebhookUrl('default'), name, events },
				});
				sd.webhookId = created.id;
				sd.secret = created.secret;
				return true;
			},
			async delete(this: IHookFunctions): Promise<boolean> {
				const sd = this.getWorkflowStaticData('node') as TriggerStaticData;
				if (sd.webhookId) {
					const res = await braultRequestRaw(this, { plane: 'regional', method: 'DELETE', path: `/v1/webhooks/${sd.webhookId}` });
					if (res.statusCode >= 300 && res.statusCode !== 404) return false;
				}
				delete sd.webhookId;
				delete sd.secret;
				return true;
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const req = this.getRequestObject() as unknown as { rawBody?: Buffer; body: IDataObject };
		const headers = this.getHeaderData() as Record<string, string | undefined>;
		const options = this.getNodeParameter('options', {}) as { verifySignature?: boolean };
		const sd = this.getWorkflowStaticData('node') as TriggerStaticData;
		if (options.verifySignature !== false) {
			if (!sd.secret) {
				const res = this.getResponseObject();
				res.status(401).json({ error: 'signature unverifiable: endpoint secret missing, deactivate and reactivate the workflow' });
				return { noWebhookResponse: true };
			}
			const raw = req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}));
			const result = verifySignature(headers['brault-signature'], raw, sd.secret);
			if (!result.ok) {
				const res = this.getResponseObject();
				res.status(401).json({ error: `signature ${result.reason}` });
				return { noWebhookResponse: true };
			}
		}
		return { workflowData: [this.helpers.returnJsonArray(req.body)] };
	}
}
