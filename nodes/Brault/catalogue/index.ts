import { board } from '../actions/board';
import { boardProperty } from '../actions/board-property';
import { brandspace } from '../actions/brandspace';
import { bulkDownload } from '../actions/bulk-download';
import { comment } from '../actions/comment';
import { file } from '../actions/file';
import { folder } from '../actions/folder';
import { importResource } from '../actions/import';
import { library } from '../actions/library';
import { member } from '../actions/member';
import { page } from '../actions/page';
import { property } from '../actions/property';
import { reply } from '../actions/reply';
import { role } from '../actions/role';
import { search } from '../actions/search';
import { sharedLink } from '../actions/shared-link';
import type { OperationSpec, ResourceSpec } from './types';

export const RESOURCES: ResourceSpec[] = [
	library,
	folder,
	file,
	importResource,
	search,
	comment,
	reply,
	board,
	boardProperty,
	property,
	page,
	sharedLink,
	bulkDownload,
	brandspace,
	member,
	role,
];

export function findOperation(resource: string, operation: string): OperationSpec | undefined {
	return RESOURCES.find((r) => r.value === resource)?.operations.find((o) => o.operation === operation);
}
