/*
 * Catalogue data, not n8n INodeProperties: these ParamSpec objects only share the
 * displayName/name/type shape. catalogue/build-properties.ts turns them into real node
 * properties and always emits a `default` there.
 */
/* eslint-disable n8n-nodes-base/node-param-default-missing */
import type { IDataObject, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import type { OperationSpec, ParamSpec } from '../catalogue/types';
import { coerce } from '../catalogue/plan-request';
import { braultRequest } from '../transport/request';
import { readValues, toItems } from './run-operation';

/** Shared by File → Set Property Value and Board → Set File Property */
export const valueParams: ParamSpec[] = [
	{
		displayName: 'Value Type',
		name: 'valueType',
		in: 'body',
		type: 'options',
		required: true,
		default: 'text',
		options: [
			{ name: 'Checkbox', value: 'checkbox' },
			{ name: 'Clear', value: 'clear' },
			{ name: 'Date', value: 'date' },
			{ name: 'Person', value: 'person' },
			{ name: 'Status (Single Option)', value: 'status' },
			{ name: 'Tags (Add / Remove Options)', value: 'tags' },
			{ name: 'Text', value: 'text' },
		],
	},
	{ name: 'text', displayName: 'Text', in: 'body', type: 'string', showWhen: { valueType: ['text'] } },
	{ name: 'date', displayName: 'Date', in: 'body', type: 'dateTime', showWhen: { valueType: ['date'] } },
	{
		name: 'checkbox',
		displayName: 'Checked',
		in: 'body',
		type: 'boolean',
		showWhen: { valueType: ['checkbox'] },
		description: 'Whether the checkbox is checked',
	},
	{
		name: 'user_id',
		displayName: 'User ID',
		in: 'body',
		type: 'string',
		placeholder: 'e.g. usr_… (Member → Get Many)',
		showWhen: { valueType: ['person'] },
	},
	{
		name: 'option_id',
		displayName: 'Option ID',
		in: 'body',
		type: 'string',
		description: 'Option to set (Board Property / Property → Get shows the options)',
		showWhen: { valueType: ['status'] },
	},
	{ name: 'add', displayName: 'Add Option IDs', in: 'body', type: 'string', csv: true, showWhen: { valueType: ['tags'] } },
	{ name: 'remove', displayName: 'Remove Option IDs', in: 'body', type: 'string', csv: true, showWhen: { valueType: ['tags'] } },
	{
		displayName: 'Property Type To Clear',
		name: 'clearType',
		in: 'body',
		type: 'options',
		default: 'text',
		showWhen: { valueType: ['clear'] },
		description:
			'Status applies to board properties only; tag properties have no null form, so clear them by removing their options with Tags',
		options: [
			{ name: 'Checkbox', value: 'checkbox' },
			{ name: 'Date', value: 'date' },
			{ name: 'Person', value: 'person' },
			{ name: 'Status (Board Only)', value: 'status' },
			{ name: 'Text', value: 'text' },
		],
	},
];

export interface ValueInput {
	text?: unknown;
	date?: unknown;
	checkbox?: unknown;
	user_id?: unknown;
	option_id?: unknown;
	add?: unknown;
	remove?: unknown;
	clearType?: unknown;
}

export function buildValueBody(kind: 'file' | 'board', valueType: string, v: ValueInput): IDataObject {
	const list = (x: unknown) =>
		Array.isArray(x) ? (x as string[]) : typeof x === 'string' && x.trim() ? x.split(',').map((s) => s.trim()).filter(Boolean) : [];
	switch (valueType) {
		case 'text':
			return { text: String(v.text ?? '') };
		case 'date':
			return { date: { start: String(v.date ?? '') } };
		case 'checkbox':
			return { checkbox: Boolean(v.checkbox) };
		case 'person':
			return { person: { user_id: String(v.user_id ?? '') } };
		case 'status':
			if (kind !== 'board') throw new Error('Status values exist on board properties only');
			return { status: { option_id: String(v.option_id ?? '') } };
		case 'tags': {
			const add = list(v.add);
			const remove = list(v.remove);
			if (!add.length && !remove.length) throw new Error('Provide at least one option ID to add or remove');
			const body: IDataObject = {};
			if (add.length) body.add = add;
			if (remove.length) body.remove = remove;
			return { [kind === 'file' ? 'tag' : 'multi_tag']: body };
		}
		case 'clear': {
			const clearType = String(v.clearType ?? 'text');
			if (!['text', 'date', 'checkbox', 'person', 'status'].includes(clearType)) {
				throw new Error(`Unknown property type ${clearType}`);
			}
			if (clearType === 'status' && kind !== 'board') throw new Error('Status values exist on board properties only');
			return { [clearType]: null };
		}
		default:
			throw new Error(`Unknown value type ${valueType}`);
	}
}

function handler(kind: 'file' | 'board', path: (v: Record<string, unknown>) => string) {
	return async (ctx: IExecuteFunctions, i: number, spec: OperationSpec): Promise<INodeExecutionData[]> => {
		const v = readValues(ctx, i, spec);
		for (const p of valueParams) v[p.name] = coerce(p, v[p.name]);
		let body: IDataObject;
		try {
			body = buildValueBody(kind, String(v.valueType), v as ValueInput);
		} catch (e) {
			throw new NodeOperationError(ctx.getNode(), (e as Error).message, { itemIndex: i });
		}
		return toItems(await braultRequest(ctx, { plane: 'regional', method: 'PUT', path: path(v), body }), i);
	};
}

const enc = (x: unknown) => encodeURIComponent(String(x));
export const setFilePropertyValue = handler('file', (v) => `/v1/files/${enc(v.fileId)}/properties/${enc(v.propertyId)}`);
export const setBoardFilePropertyValue = handler(
	'board',
	(v) => `/v1/boards/${enc(v.boardId)}/files/${enc(v.fileId)}/properties/${enc(v.propertyId)}`,
);
