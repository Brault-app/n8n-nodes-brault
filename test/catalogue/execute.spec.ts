import type { IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { Brault } from '../../nodes/Brault/Brault.node';

jest.mock('../../nodes/Brault/actions/run-operation', () => ({ runOperation: jest.fn() }));
import { runOperation } from '../../nodes/Brault/actions/run-operation';

const mockedRun = runOperation as jest.Mock;

function makeCtx(continueOnFail: boolean, itemCount = 2): IExecuteFunctions {
	const inputItems: INodeExecutionData[] = Array.from({ length: itemCount }, () => ({ json: {} }));
	return {
		getInputData: () => inputItems,
		getNodeParameter: (name: string) => {
			if (name === 'resource') return 'library';
			if (name === 'operation') return 'getAll';
			return undefined;
		},
		continueOnFail: () => continueOnFail,
		getNode: () => ({ name: 'Brault' }),
	} as unknown as IExecuteFunctions;
}

describe('Brault.execute error handling', () => {
	const node = new Brault();

	beforeEach(() => mockedRun.mockReset());

	it('pushes an error item per failed item when continueOnFail is true, even for a falsy thrown value', async () => {
		mockedRun.mockRejectedValueOnce(undefined);
		mockedRun.mockResolvedValueOnce([{ json: { id: 'li_1' }, pairedItem: { item: 1 } }]);

		const result = await node.execute.call(makeCtx(true));

		expect(result[0]).toHaveLength(2);
		expect(result[0][0].pairedItem).toEqual({ item: 0 });
		expect(typeof (result[0][0].json as { error: unknown }).error).toBe('string');
		expect(result[0][1]).toEqual({ json: { id: 'li_1' }, pairedItem: { item: 1 } });
	});

	it('rethrows the (normalised) error when continueOnFail is false, even for a falsy thrown value', async () => {
		mockedRun.mockRejectedValueOnce(undefined);

		await expect(node.execute.call(makeCtx(false, 1))).rejects.toBeInstanceOf(Error);
		expect(mockedRun).toHaveBeenCalledTimes(1);
	});
});
