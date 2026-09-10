import type { IExecuteFunctions, INodeExecutionData, INodeType, INodeTypeDescription } from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import { runOperation } from './actions/run-operation';
import { findOperation, RESOURCES } from './catalogue';
import { buildProperties } from './catalogue/build-properties';
import { listSearch } from './methods/list-search';

export class Brault implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Brault',
		name: 'brault',
		// Temporary placeholder mark; Task 15 replaces this with the exported Brault mark.
		icon: 'file:brault.svg',
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

	methods = { listSearch };

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
			let failure: Error | undefined;
			try {
				out.push(...(await runOperation(this, i, spec)));
			} catch (error) {
				failure = error as Error;
			}
			// The rethrow lives outside the catch block so the original NodeApiError or
			// NodeOperationError raised by the transport reaches the user unwrapped.
			if (failure) {
				if (!this.continueOnFail()) throw failure;
				out.push({ json: { error: failure.message }, pairedItem: { item: i } });
			}
		}
		return [out];
	}
}
