import { RESOURCES } from '../../nodes/Brault/catalogue';

describe('catalogue structure', () => {
	const ops = RESOURCES.flatMap((r) => r.operations);
	it('has unique resource/operation pairs and complete copy', () => {
		const keys = ops.map((o) => `${o.resource}.${o.operation}`);
		expect(new Set(keys).size).toBe(keys.length);
		for (const o of ops) {
			expect(o.name).toMatch(/^[A-Z]/);
			expect(o.action).toMatch(/^[A-Z][^A-Z]*$/);
			expect(o.description.length).toBeGreaterThan(8);
			expect(o.path.startsWith('/v1/')).toBe(true);
			for (const m of o.path.matchAll(/\{(\w+)\}/g))
				expect((o.params ?? []).some((p) => p.name === m[1] && p.in === 'path')).toBe(true);
		}
	});
});
