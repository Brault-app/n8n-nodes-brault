import type { IDataObject, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { planRequest, type RequestPlan } from '../catalogue/plan-request';
import type { OperationSpec } from '../catalogue/types';
import { braultRequest, braultRequestRaw, type BraultRequestOptions } from '../transport/request';
import { readValues, toItems } from './run-operation';

/**
 * Shared handler for file.delete, folder.delete and page.delete.
 *
 * `DELETE …?permanent=true` only works on an item that is already in the trash: on a live
 * item the API answers `400 invalid_request`. So when the user asks for a permanent delete,
 * trash the item first and then repeat the call with `permanent=true`. The trash call goes
 * through `braultRequestRaw` and its status is ignored on purpose: a 4xx there means the
 * item was already in the trash, which is exactly the state the second call needs.
 */
export async function deleteWithTrash(
	ctx: IExecuteFunctions,
	i: number,
	spec: OperationSpec,
): Promise<INodeExecutionData[]> {
	let plan: RequestPlan;
	try {
		plan = planRequest(spec, readValues(ctx, i, spec));
	} catch (e) {
		throw new NodeOperationError(ctx.getNode(), (e as Error).message, { itemIndex: i });
	}
	const qs: IDataObject = { ...plan.qs };
	const permanent = qs.permanent === true || qs.permanent === 'true';
	delete qs.permanent;

	const base: BraultRequestOptions = {
		plane: plan.plane,
		method: plan.method,
		path: plan.path,
		...(Object.keys(qs).length > 0 ? { qs } : {}),
	};
	if (!permanent) return toItems(await braultRequest(ctx, base), i);

	await braultRequestRaw(ctx, base);
	return toItems(await braultRequest(ctx, { ...base, qs: { ...qs, permanent: true } }), i);
}
