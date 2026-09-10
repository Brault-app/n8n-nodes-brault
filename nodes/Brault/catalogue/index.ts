import { comment } from '../actions/comment';
import { file } from '../actions/file';
import { folder } from '../actions/folder';
import { importResource } from '../actions/import';
import { library } from '../actions/library';
import { reply } from '../actions/reply';
import { search } from '../actions/search';
import type { OperationSpec, ResourceSpec } from './types';

export const RESOURCES: ResourceSpec[] = [library, folder, file, importResource, search, comment, reply];

export function findOperation(resource: string, operation: string): OperationSpec | undefined {
	return RESOURCES.find((r) => r.value === resource)?.operations.find((o) => o.operation === operation);
}
