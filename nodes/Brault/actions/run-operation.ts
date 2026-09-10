import type { IDataObject, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { planRequest, type RequestPlan } from '../catalogue/plan-request';
import type { OperationSpec } from '../catalogue/types';
import { getAll } from '../transport/pagination';
import { braultRequest, isListEnvelope } from '../transport/request';

export function readValues(ctx: IExecuteFunctions, i: number, spec: OperationSpec): Record<string, unknown> {
	const values: Record<string, unknown> = {};
	for (const p of spec.params ?? [])
		values[p.name] = p.locator
			? ctx.getNodeParameter(p.name, i, undefined, { extractValue: true })
			: ctx.getNodeParameter(p.name, i, p.default);
	if (spec.fields?.length) Object.assign(values, ctx.getNodeParameter('additionalFields', i, {}) as IDataObject);
	return values;
}

/**
 * Single-page list envelopes (for example GET /v1/files/{id}/boards) answer without
 * pagination params, so unwrap them here instead of declaring the operation as a list.
 * Reuses the transport layer's own envelope check instead of duplicating it.
 */
export function toItems(data: unknown, i: number): INodeExecutionData[] {
	const rows = Array.isArray(data) ? data : isListEnvelope(data) ? data.data : [data];
	return rows.map((json) => ({ json: (json ?? {}) as IDataObject, pairedItem: { item: i } }));
}

export async function runOperation(
	ctx: IExecuteFunctions,
	i: number,
	spec: OperationSpec,
): Promise<INodeExecutionData[]> {
	if (spec.custom) return spec.custom(ctx, i, spec);
	let plan: RequestPlan;
	try {
		plan = planRequest(spec, readValues(ctx, i, spec));
	} catch (e) {
		throw new NodeOperationError(ctx.getNode(), (e as Error).message, { itemIndex: i });
	}
	const creating = spec.method === 'POST';
	if (spec.list) {
		const returnAll = ctx.getNodeParameter('returnAll', i, false) as boolean;
		const limit = ctx.getNodeParameter('limit', i, 50) as number;
		const rows = await getAll(ctx, { ...plan, idempotent: false }, { returnAll, limit });
		return toItems(rows, i);
	}
	const data = await braultRequest(ctx, { ...plan, idempotent: creating });
	return toItems(data, i);
}
