import { planRequest } from '../../nodes/Brault/catalogue/plan-request';
import type { OperationSpec } from '../../nodes/Brault/catalogue/types';

const spec: OperationSpec = {
	resource: 'file',
	operation: 'move',
	name: 'Move',
	action: 'Move a file',
	description: 'Move a file to another folder',
	method: 'POST',
	plane: 'regional',
	path: '/v1/files/{fileId}/move',
	params: [{ name: 'fileId', displayName: 'File', in: 'path', type: 'string', required: true, locator: 'file' }],
	fields: [
		{ name: 'library_id', displayName: 'Library ID', in: 'body', type: 'string', locator: 'library' },
		{ name: 'folder_id', displayName: 'Folder ID', in: 'body', type: 'string', locator: 'folder' },
		{ name: 'to_root', displayName: 'To Root', in: 'body', type: 'boolean' },
		{ name: 'tags', displayName: 'Tags', in: 'body', type: 'string', csv: true },
		{ name: 'recursive', displayName: 'Recursive', in: 'query', type: 'boolean' },
		{ name: 'filter', displayName: 'Filter', in: 'body', type: 'json' },
	],
};

describe('planRequest', () => {
	it('substitutes path params with URL encoding and routes fields to body/query', () => {
		const plan = planRequest(spec, {
			fileId: 'f/1',
			folder_id: 'fo_1',
			to_root: false,
			tags: 'a, b ,',
			recursive: true,
			filter: '{"kind":"image"}',
		});
		expect(plan).toEqual({
			plane: 'regional',
			method: 'POST',
			path: '/v1/files/f%2F1/move',
			qs: { recursive: true },
			// to_root: false is dropped: the API counts any present destination field (§ 2.9)
			body: { folder_id: 'fo_1', tags: ['a', 'b'], filter: { kind: 'image' } },
		});
	});
	it('drops library_id when a folder_id is set, because a folder implies its library', () => {
		const plan = planRequest(spec, { fileId: 'f1', library_id: 'lib_1', folder_id: 'fo_1' });
		expect(plan.body).toEqual({ folder_id: 'fo_1' });
	});
	it('drops both locators when to_root is true', () => {
		const plan = planRequest(spec, { fileId: 'f1', library_id: 'lib_1', folder_id: 'fo_1', to_root: true });
		expect(plan.body).toEqual({ to_root: true });
	});
	it('drops to_root when it is false', () => {
		const plan = planRequest(spec, { fileId: 'f1', library_id: 'lib_1', to_root: false });
		expect(plan.body).toEqual({ library_id: 'lib_1' });
	});
	it('leaves query destinations alone: list filters accept a library and a folder together', () => {
		const listSpec: OperationSpec = {
			...spec,
			method: 'GET',
			fields: [
				{ name: 'library_id', displayName: 'Library ID', in: 'query', type: 'string', locator: 'library' },
				{ name: 'folder_id', displayName: 'Folder ID', in: 'query', type: 'string', locator: 'folder' },
			],
		};
		const plan = planRequest(listSpec, { fileId: 'f1', library_id: 'lib_1', folder_id: 'fo_1' });
		expect(plan.qs).toEqual({ library_id: 'lib_1', folder_id: 'fo_1' });
		expect(plan.body).toEqual({});
	});
	it('omits empty strings and undefined values', () => {
		const plan = planRequest(spec, { fileId: 'f1', folder_id: '', tags: undefined });
		expect(plan.body).toEqual({});
		expect(plan.qs).toEqual({});
	});
	it('throws on a missing required path param', () => {
		expect(() => planRequest(spec, {})).toThrow(/File/);
	});
	it('extracts .value from a resourceLocator object for a locator field', () => {
		const plan = planRequest(spec, { fileId: 'f1', folder_id: { mode: 'list', value: 'fo_1' } });
		expect(plan.body).toEqual({ folder_id: 'fo_1' });
	});
	it('passes a plain string through unchanged for a locator field', () => {
		const plan = planRequest(spec, { fileId: 'f1', folder_id: 'fo_2' });
		expect(plan.body).toEqual({ folder_id: 'fo_2' });
	});
	it('throws a readable message when a number field is not numeric', () => {
		const numberSpec: OperationSpec = {
			...spec,
			fields: [{ name: 'width', displayName: 'Width', in: 'body', type: 'number' }],
		};
		expect(() => planRequest(numberSpec, { fileId: 'f1', width: 'not-a-number' })).toThrow(
			'Width must be a number',
		);
	});
	it('omits a multiOptions field left unselected (empty array)', () => {
		const multiSpec: OperationSpec = {
			...spec,
			fields: [{ name: 'kind', displayName: 'Kind', in: 'query', type: 'multiOptions' }],
		};
		const plan = planRequest(multiSpec, { fileId: 'f1', kind: [] });
		expect(plan.qs).toEqual({});
	});
	it('sends a multiOptions field with a selected value', () => {
		const multiSpec: OperationSpec = {
			...spec,
			fields: [{ name: 'kind', displayName: 'Kind', in: 'query', type: 'multiOptions' }],
		};
		const plan = planRequest(multiSpec, { fileId: 'f1', kind: ['image'] });
		expect(plan.qs).toEqual({ kind: ['image'] });
	});
});
