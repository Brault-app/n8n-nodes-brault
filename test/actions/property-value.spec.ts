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
	it('clear sends null for text', () => {
		expect(buildValueBody('file', 'clear', {})).toEqual({ text: null });
	});
	it('rejects status on files', () => {
		expect(() => buildValueBody('file', 'status', { option_id: 'o1' })).toThrow(/board/);
	});
});
