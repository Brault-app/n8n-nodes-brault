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

/**
 * `readValues` bulk-assigns the whole `additionalFields` collection, so a locator field
 * inside it never goes through n8n's `extractValue: true` param resolution and arrives
 * here as the raw resourceLocator shape (`{ mode, value }`) instead of a plain string.
 * Unwrap it here so both top-level and Additional Fields locators resolve the same way.
 */
function extractLocatorValue(raw: unknown): unknown {
	if (raw === null || typeof raw !== 'object') return raw;
	const obj = raw as { value?: unknown; __rl?: boolean };
	if (obj.__rl === true || 'value' in obj) return obj.value;
	return raw;
}

export function coerce(param: ParamSpec, raw: unknown): unknown {
	if (param.locator) raw = extractLocatorValue(raw);
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
	if (param.type === 'number') {
		const n = Number(raw);
		if (Number.isNaN(n)) throw new Error(`${param.displayName} must be a number`);
		return n;
	}
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
