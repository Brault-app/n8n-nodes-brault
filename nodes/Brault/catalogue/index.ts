import { library } from '../actions/library';
import type { OperationSpec, ResourceSpec } from './types';

export const RESOURCES: ResourceSpec[] = [library];

export function findOperation(resource: string, operation: string): OperationSpec | undefined {
	return RESOURCES.find((r) => r.value === resource)?.operations.find((o) => o.operation === operation);
}
