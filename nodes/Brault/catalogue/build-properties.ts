import type { INodeProperties, INodePropertyOptions } from 'n8n-workflow';
import { LIMIT_PARAM_MAX } from '../transport/pagination';
import type { LocatorKind, OperationSpec, ParamSpec, ResourceSpec } from './types';

const SEARCH_METHOD: Record<LocatorKind, string> = {
	library: 'searchLibraries',
	folder: 'searchFolders',
	file: 'searchFiles',
	board: 'searchBoards',
	page: 'searchPages',
	property: 'searchProperties',
};

function show(op: OperationSpec, extra: Record<string, unknown[]> = {}) {
	return { show: { resource: [op.resource], operation: [op.operation], ...extra } };
}

export function paramToProperty(p: ParamSpec, op: OperationSpec): INodeProperties {
	if (p.locator) {
		return {
			displayName: p.displayName,
			name: p.name,
			type: 'resourceLocator',
			required: p.required,
			default: { mode: 'list', value: '' },
			description: p.description,
			displayOptions: show(op),
			modes: [
				{
					displayName: 'From List',
					name: 'list',
					type: 'list',
					typeOptions: { searchListMethod: SEARCH_METHOD[p.locator], searchable: true },
				},
				{ displayName: 'By ID', name: 'id', type: 'string', placeholder: p.placeholder ?? 'e.g. cmtr…' },
			],
		};
	}
	const base: INodeProperties = {
		displayName: p.displayName,
		name: p.name,
		type: p.type === 'dateTime' ? 'dateTime' : p.type,
		default:
			(p.default as INodeProperties['default']) ??
			(p.type === 'boolean' ? false : p.type === 'number' ? 0 : p.type === 'multiOptions' ? [] : ''),
		description: p.description,
		placeholder: p.placeholder,
		required: p.required,
		displayOptions: show(op),
	};
	if (p.type === 'options' || p.type === 'multiOptions') base.options = p.options as INodePropertyOptions[];
	if (p.type === 'json') base.typeOptions = { rows: 4 };
	return base;
}

export function buildProperties(resources: ResourceSpec[]): INodeProperties[] {
	const resourceProp: INodeProperties = {
		displayName: 'Resource',
		name: 'resource',
		type: 'options',
		noDataExpression: true,
		default: '',
		options: resources.map((r) => ({ name: r.name, value: r.value, description: r.description })),
	};
	resourceProp.default = resources[0]?.value ?? '';
	const out: INodeProperties[] = [resourceProp];
	for (const r of resources) {
		const operationProp: INodeProperties = {
			displayName: 'Operation',
			name: 'operation',
			type: 'options',
			noDataExpression: true,
			default: '',
			displayOptions: { show: { resource: [r.value] } },
			options: r.operations.map((o) => ({
				name: o.name,
				value: o.operation,
				action: o.action,
				description: o.description,
			})),
		};
		operationProp.default = r.operations[0]?.operation ?? '';
		out.push(operationProp);
		for (const op of r.operations) {
			for (const p of op.params ?? []) out.push(paramToProperty(p, op));
			if (op.list) {
				out.push({
					displayName: 'Return All',
					name: 'returnAll',
					type: 'boolean',
					default: false,
					description: 'Whether to return all results or only up to a given limit',
					displayOptions: show(op),
				});
				out.push({
					displayName: 'Limit',
					name: 'limit',
					type: 'number',
					default: 50,
					typeOptions: { minValue: 1, maxValue: LIMIT_PARAM_MAX },
					description: 'Max number of results to return',
					displayOptions: show(op, { returnAll: [false] }),
				});
			}
			if (op.fields?.length) {
				out.push({
					displayName: 'Additional Fields',
					name: 'additionalFields',
					type: 'collection',
					placeholder: 'Add Field',
					default: {},
					displayOptions: show(op),
					options: op.fields.map((f) => {
						const prop = paramToProperty(f, op);
						delete prop.displayOptions;
						delete prop.required;
						return prop;
					}),
				});
			}
		}
	}
	return out;
}
