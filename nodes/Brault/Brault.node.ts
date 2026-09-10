import type { IExecuteFunctions, INodeExecutionData, INodeType, INodeTypeDescription } from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import { runOperation } from './actions/run-operation';
import { findOperation, RESOURCES } from './catalogue';
import { buildProperties } from './catalogue/build-properties';
import { listSearch } from './methods/list-search';
import { loadOptions } from './methods/load-options';

export class Brault implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Brault',
		name: 'brault',
		icon: { light: 'file:brault.svg', dark: 'file:brault.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Work with files, folders, boards, comments, review links and transfers in Brault',
		defaults: { name: 'Brault' },
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		credentials: [{ name: 'braultApi', required: true }],
		properties: buildProperties(RESOURCES),
	};

	methods = { listSearch, loadOptions };

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const out: INodeExecutionData[] = [];
		for (let i = 0; i < items.length; i++) {
			const resource = this.getNodeParameter('resource', i) as string;
			const operation = this.getNodeParameter('operation', i) as string;
			const spec = findOperation(resource, operation);
			if (!spec)
				throw new NodeOperationError(this.getNode(), `Unknown operation ${resource}.${operation}`, {
					itemIndex: i,
				});
			// An explicit flag (rather than `if (failure)`) so a falsy thrown value
			// (`throw undefined`, `throw null`, `throw ''`) still registers as a failure
			// instead of being silently swallowed and dropping the item.
			let failed = false;
			let failure: Error = new Error();
			try {
				out.push(...(await runOperation(this, i, spec)));
			} catch (error) {
				failed = true;
				// Normalise non-Error throws to a real Error, but keep Error instances
				// (including NodeApiError / NodeOperationError) intact so their original
				// shape reaches the user unwrapped.
				failure = error instanceof Error ? error : new Error(String(error));
				if (failure instanceof NodeApiError && failure.context.itemIndex === undefined) {
					failure.context.itemIndex = i;
				}
			}
			// The rethrow lives outside the catch block so the original NodeApiError or
			// NodeOperationError raised by the transport reaches the user unwrapped.
			if (failed) {
				if (!this.continueOnFail()) throw failure;
				out.push({ json: { error: failure.message }, pairedItem: { item: i } });
			}
		}
		return [out];
	}
}
