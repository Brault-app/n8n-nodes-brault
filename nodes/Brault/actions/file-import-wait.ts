import type { IDataObject, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { NodeOperationError, sleep } from 'n8n-workflow';
import { planRequest } from '../catalogue/plan-request';
import type { OperationSpec } from '../catalogue/types';
import type { TransportContext } from '../transport/hosts';
import { braultRequest } from '../transport/request';
import { readValues, toItems } from './run-operation';

/**
 * Polls `GET /v1/imports/{importId}` until it succeeds, fails, or the wait limit is
 * reached. On success, fetches and returns the created file.
 */
export async function waitForImport(
	ctx: TransportContext,
	importId: string,
	o: { intervalMs?: number; timeoutMs?: number } = {},
): Promise<IDataObject> {
	const interval = o.intervalMs ?? 3000;
	const deadline = Date.now() + (o.timeoutMs ?? 10 * 60 * 1000);
	for (;;) {
		const imp = await braultRequest<IDataObject>(ctx, { plane: 'regional', method: 'GET', path: `/v1/imports/${importId}` });
		if (imp.status === 'succeeded')
			return braultRequest<IDataObject>(ctx, { plane: 'regional', method: 'GET', path: `/v1/files/${String(imp.file_id)}` });
		if (imp.status === 'failed')
			throw new NodeOperationError(ctx.getNode(), `Import ${importId} failed: ${String(imp.error_code ?? 'unknown error')}`);
		if (Date.now() >= deadline)
			throw new NodeOperationError(
				ctx.getNode(),
				`Import ${importId} is still ${String(imp.status)} after the wait limit; poll Import → Get later`,
			);
		await sleep(interval);
	}
}

/**
 * Custom handler for File → Import From URL. Starts the import, then — if the caller
 * asked to wait — polls until it resolves into a file before returning.
 */
export async function importFromUrl(ctx: IExecuteFunctions, i: number, spec: OperationSpec): Promise<INodeExecutionData[]> {
	const values = readValues(ctx, i, spec);
	const wait = values.wait === true;
	delete values.wait;
	const plan = planRequest(spec, values);
	const imp = await braultRequest<IDataObject>(ctx, { ...plan, idempotent: true });
	return toItems(wait ? await waitForImport(ctx, String(imp.id)) : imp, i);
}
