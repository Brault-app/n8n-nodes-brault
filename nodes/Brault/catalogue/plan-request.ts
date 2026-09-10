import type { IDataObject } from 'n8n-workflow';
import { jsonParse } from 'n8n-workflow';
import type { OperationSpec, ParamSpec } from './types';

export interface RequestPlan {
	plane: OperationSpec['plane'];
	method: OperationSpec['method'];
	path: string;
	qs: IDataObject;
	body: IDataObject;
}

function isEmpty(v: unknown): boolean {
	return v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
}

export function coerce(param: ParamSpec, raw: unknown): unknown {
	if (isEmpty(raw)) return undefined;
	if (param.csv && typeof raw === 'string')
		return raw
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean);
	if (param.type === 'json') {
		if (typeof raw !== 'string') return raw;
		// jsonParse throws with this message; runOperation turns it into a NodeOperationError
		return jsonParse(raw, { errorMessage: `${param.displayName} must be valid JSON` });
	}
	if (param.type === 'number') return Number(raw);
	return raw;
}

export function planRequest(spec: OperationSpec, values: Record<string, unknown>): RequestPlan {
	const all: ParamSpec[] = [...(spec.params ?? []), ...(spec.fields ?? [])];
	const qs: IDataObject = {};
	const body: IDataObject = {};
	let path = spec.path;
	for (const p of all) {
		const v = coerce(p, values[p.name]);
		if (p.in === 'path') {
			if (isEmpty(v)) throw new Error(`${p.displayName} is required`);
			path = path.replace(`{${p.name}}`, encodeURIComponent(String(v)));
			continue;
		}
		if (v === undefined) continue;
		(p.in === 'query' ? qs : body)[p.name] = v as IDataObject[string];
	}
	return { plane: spec.plane, method: spec.method, path, qs, body };
}
