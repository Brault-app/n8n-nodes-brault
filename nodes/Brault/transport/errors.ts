import type { IDataObject, INode, JsonObject } from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';
import type { BraultResponse } from './request';

export interface BraultApiErrorInfo {
	code: string;
	message: string;
	status: number;
	requestId?: string;
	details?: IDataObject;
}

export function parseErrorBody(body: unknown, status: number): BraultApiErrorInfo {
	const err = (body as { error?: IDataObject } | undefined)?.error;
	if (err && typeof err === 'object' && typeof err.code === 'string') {
		return {
			code: err.code,
			message: String(err.message ?? err.code),
			status,
			requestId: typeof err.request_id === 'string' ? err.request_id : undefined,
			details: (err.details as IDataObject) ?? undefined,
		};
	}
	return { code: `http_${status}`, message: `Brault answered HTTP ${status}`, status };
}

export function friendlyMessage(info: BraultApiErrorInfo): string {
	const details = info.details ?? {};

	if (details.reason === 'webhook_limit_reached') {
		const max = details.max !== undefined ? `${String(details.max)} ` : '';
		return `Your Brault plan allows ${max}webhook endpoints. Remove one under Settings → Developers → Webhooks, or upgrade the plan.`;
	}

	if (info.code === 'insufficient_scope') {
		const scope = details.required;
		const missing = typeof scope === 'string' && scope.length > 0 ? `the scope ${scope}` : 'a required scope';
		return `The API key lacks ${missing}. Create a key with that scope under Settings → Developers.`;
	}

	if (info.code === 'misdirected_request') {
		const host = typeof details.host === 'string' ? details.host : 'the host named in details.host';
		return `This brandspace lives in another region. Set the credential Base URL to ${host}.`;
	}

	if (info.status === 429) {
		return `Rate limited by Brault (${info.message}). Reduce the workflow's request rate or upgrade the plan.`;
	}

	return info.message;
}

export function toNodeApiError(node: INode, res: BraultResponse): NodeApiError {
	const info = parseErrorBody(res.body, res.statusCode);
	const description = [
		info.code,
		info.requestId ? `request_id ${info.requestId}` : undefined,
		res.statusCode === 429 && res.headers['retry-after'] !== undefined ? `Retry-After ${String(res.headers['retry-after'])}s` : undefined,
	]
		.filter(Boolean)
		.join(' · ');
	return new NodeApiError(node, (res.body as JsonObject) ?? {}, {
		message: friendlyMessage(info),
		description,
		httpCode: String(res.statusCode),
	});
}
