import type { IDataObject, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { coerce } from '../catalogue/plan-request';
import type { OperationSpec } from '../catalogue/types';
import { braultRequest } from '../transport/request';
import { readValues, toItems } from './run-operation';

export interface SharedLinkCreateInput {
	targetType?: unknown;
	targetId?: unknown;
	access?: unknown;
	password?: unknown;
	expires_at?: unknown;
	anonymous_comments?: unknown;
	board_views?: unknown;
}

const isEmpty = (v: unknown): boolean => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');

/** Nests `targetType`/`targetId` into `target: { type, id }` and forwards the rest when set. */
export function buildSharedLinkBody(v: SharedLinkCreateInput): IDataObject {
	const body: IDataObject = { target: { type: String(v.targetType ?? ''), id: String(v.targetId ?? '') } };
	if (!isEmpty(v.access)) body.access = v.access as IDataObject[string];
	if (!isEmpty(v.password)) body.password = v.password as IDataObject[string];
	if (!isEmpty(v.expires_at)) body.expires_at = v.expires_at as IDataObject[string];
	if (v.anonymous_comments !== undefined && v.anonymous_comments !== null) body.anonymous_comments = v.anonymous_comments as IDataObject[string];
	if (!isEmpty(v.board_views)) body.board_views = v.board_views as IDataObject[string];
	return body;
}

/** Custom handler for Shared Link → Create: nests `target` before sending the request. */
export async function createSharedLink(ctx: IExecuteFunctions, i: number, spec: OperationSpec): Promise<INodeExecutionData[]> {
	const values = readValues(ctx, i, spec);
	for (const p of [...(spec.params ?? []), ...(spec.fields ?? [])]) values[p.name] = coerce(p, values[p.name]);
	const body = buildSharedLinkBody(values as SharedLinkCreateInput);
	const data = await braultRequest(ctx, { plane: spec.plane, method: spec.method, path: spec.path, body, idempotent: true });
	return toItems(data, i);
}
