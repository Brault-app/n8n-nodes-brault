import { buildValueBody } from '../../nodes/Brault/actions/property-value';

describe('buildValueBody', () => {
	it('text / date / checkbox / person', () => {
		expect(buildValueBody('file', 'text', { text: 'Hello' })).toEqual({ text: 'Hello' });
		expect(buildValueBody('file', 'date', { date: '2026-09-10T00:00:00.000Z' })).toEqual({
			date: { start: '2026-09-10T00:00:00.000Z' },
		});
		expect(buildValueBody('board', 'checkbox', { checkbox: true })).toEqual({ checkbox: true });
		expect(buildValueBody('board', 'person', { user_id: 'u1' })).toEqual({ person: { user_id: 'u1' } });
	});
	it('status on boards, tags with add/remove on both (tag for files, multi_tag for boards)', () => {
		expect(buildValueBody('board', 'status', { option_id: 'o1' })).toEqual({ status: { option_id: 'o1' } });
		expect(buildValueBody('file', 'tags', { add: ['o1', 'o2'], remove: [] })).toEqual({ tag: { add: ['o1', 'o2'] } });
		expect(buildValueBody('board', 'tags', { add: [], remove: ['o3'] })).toEqual({ multi_tag: { remove: ['o3'] } });
	});
	it('clear sends null on the field named after the chosen property type', () => {
		expect(buildValueBody('file', 'clear', {})).toEqual({ text: null });
		expect(buildValueBody('file', 'clear', { clearType: 'text' })).toEqual({ text: null });
		expect(buildValueBody('board', 'clear', { clearType: 'date' })).toEqual({ date: null });
		expect(buildValueBody('file', 'clear', { clearType: 'person' })).toEqual({ person: null });
		expect(buildValueBody('file', 'clear', { clearType: 'checkbox' })).toEqual({ checkbox: null });
	});
	it('rejects status on files', () => {
		expect(() => buildValueBody('file', 'status', { option_id: 'o1' })).toThrow(/board/);
	});
	it('rejects clearing status on files', () => {
		expect(() => buildValueBody('file', 'clear', { clearType: 'status' })).toThrow(/board/);
	});
	it('clears status on boards', () => {
		expect(buildValueBody('board', 'clear', { clearType: 'status' })).toEqual({ status: null });
	});
	it('rejects an unknown clearType', () => {
		expect(() => buildValueBody('file', 'clear', { clearType: 'tags' })).toThrow(/Unknown property type tags/);
	});
	it('rejects tags with both add and remove empty', () => {
		expect(() => buildValueBody('file', 'tags', { add: [], remove: [] })).toThrow(
			/Provide at least one option ID to add or remove/,
		);
	});
});
