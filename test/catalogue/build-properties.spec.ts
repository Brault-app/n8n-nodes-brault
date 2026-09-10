import { buildProperties, paramToProperty } from '../../nodes/Brault/catalogue/build-properties';
import type { OperationSpec, ResourceSpec } from '../../nodes/Brault/catalogue/types';

const resources: ResourceSpec[] = [
	{
		value: 'library',
		name: 'Library',
		description: 'Libraries',
		operations: [
			{
				resource: 'library',
				operation: 'getAll',
				name: 'Get Many',
				action: 'Get many libraries',
				description: 'List libraries',
				method: 'GET',
				plane: 'regional',
				path: '/v1/libraries',
				list: true,
			},
			{
				resource: 'library',
				operation: 'create',
				name: 'Create',
				action: 'Create a library',
				description: 'Create a library',
				method: 'POST',
				plane: 'regional',
				path: '/v1/libraries',
				params: [{ name: 'name', displayName: 'Name', in: 'body', type: 'string', required: true }],
				fields: [{ name: 'emoji', displayName: 'Emoji', in: 'body', type: 'string' }],
			},
			{
				resource: 'library',
				operation: 'get',
				name: 'Get',
				action: 'Get a library',
				description: 'Get a library',
				method: 'GET',
				plane: 'regional',
				path: '/v1/libraries/{libraryId}',
				params: [
					{ name: 'libraryId', displayName: 'Library', in: 'path', type: 'string', required: true, locator: 'library' },
				],
			},
		],
	},
];

describe('buildProperties', () => {
	const props = buildProperties(resources);
	const byName = (n: string) => props.filter((p) => p.name === n);
	it('emits the resource selector first, then one operation selector per resource', () => {
		expect(props[0]).toMatchObject({
			name: 'resource',
			type: 'options',
			options: [{ name: 'Library', value: 'library' }],
		});
		expect(byName('operation')[0]).toMatchObject({
			displayOptions: { show: { resource: ['library'] } },
			default: 'getAll',
		});
		expect((byName('operation')[0].options as Array<{ action: string }>).map((o) => o.action)).toEqual([
			'Get many libraries',
			'Create a library',
			'Get a library',
		]);
	});
	it('adds Return All and Limit for list operations', () => {
		expect(byName('returnAll')[0]).toMatchObject({
			type: 'boolean',
			default: false,
			displayOptions: { show: { resource: ['library'], operation: ['getAll'] } },
		});
		expect(byName('limit')[0]).toMatchObject({
			type: 'number',
			default: 50,
			typeOptions: { minValue: 1, maxValue: 1000 },
			displayOptions: { show: { resource: ['library'], operation: ['getAll'], returnAll: [false] } },
		});
	});
	it('renders locators as resourceLocator with list and id modes', () => {
		expect(byName('libraryId')[0]).toMatchObject({
			type: 'resourceLocator',
			modes: [
				{ name: 'list', typeOptions: { searchListMethod: 'searchLibraries', searchable: true } },
				{ name: 'id' },
			],
		});
	});
	it('wraps optional fields in an Additional Fields collection', () => {
		expect(byName('additionalFields')[0]).toMatchObject({
			type: 'collection',
			displayOptions: { show: { resource: ['library'], operation: ['create'] } },
			options: [{ name: 'emoji' }],
		});
	});
	it('merges a param showWhen into displayOptions.show alongside resource/operation', () => {
		const op: OperationSpec = {
			resource: 'library',
			operation: 'setValue',
			name: 'Set Value',
			action: 'Set a value',
			description: 'Set a value on the library',
			method: 'PUT',
			plane: 'regional',
			path: '/v1/libraries/{libraryId}/value',
			params: [
				{ name: 'valueType', displayName: 'Value Type', in: 'body', type: 'options', default: 'text', options: [{ name: 'Text', value: 'text' }] },
				{ name: 'text', displayName: 'Text', in: 'body', type: 'string', showWhen: { valueType: ['text'] } },
			],
		};
		expect(paramToProperty(op.params![1], op).displayOptions).toEqual({
			show: { resource: ['library'], operation: ['setValue'], valueType: ['text'] },
		});
	});
});
