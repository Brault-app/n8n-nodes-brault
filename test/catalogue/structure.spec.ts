import { RESOURCES } from '../../nodes/Brault/catalogue';
import type { ParamSpec } from '../../nodes/Brault/catalogue/types';

describe('catalogue structure', () => {
	const ops = RESOURCES.flatMap((r) => r.operations);
	it('has unique resource/operation pairs and complete copy', () => {
		const keys = ops.map((o) => `${o.resource}.${o.operation}`);
		expect(new Set(keys).size).toBe(keys.length);
		for (const o of ops) {
			expect(o.name).toMatch(/^[A-Z]/);
			// Sentence case: one leading capital, then no capitals except the acronyms n8n copy uses.
			expect(o.action.replace(/\b(API|URL|URLs|ID|IDs)\b/g, 'x')).toMatch(/^[A-Z][^A-Z]*$/);
			expect(o.description.length).toBeGreaterThan(8);
			expect(o.path.startsWith('/v1/')).toBe(true);
			for (const m of o.path.matchAll(/\{(\w+)\}/g))
				expect((o.params ?? []).some((p) => p.name === m[1] && p.in === 'path')).toBe(true);
		}
	});

	describe('parameter invariants within a resource', () => {
		for (const r of RESOURCES) {
			it(`${r.value}: a repeated param name (within params, and separately within fields) keeps the same type and locator`, () => {
				for (const collectionKey of ['params', 'fields'] as const) {
					const seen = new Map<string, { type: ParamSpec['type']; locator: ParamSpec['locator'] }>();
					for (const op of r.operations) {
						for (const p of op[collectionKey] ?? []) {
							const shape = { type: p.type, locator: p.locator };
							const prior = seen.get(p.name);
							if (prior) {
								expect(shape).toEqual(prior);
							} else {
								seen.set(p.name, shape);
							}
						}
					}
				}
			});

			it(`${r.value}: every "options" param (not multiOptions) declares a non-empty options list and a default among its values`, () => {
				for (const op of r.operations) {
					for (const p of [...(op.params ?? []), ...(op.fields ?? [])]) {
						if (p.type !== 'options') continue;
						expect(p.options?.length ?? 0).toBeGreaterThan(0);
						expect(p.options?.some((o) => o.value === p.default)).toBe(true);
					}
				}
			});

			it(`${r.value}: every path param has a matching {name} placeholder in its operation's path`, () => {
				for (const op of r.operations) {
					for (const p of op.params ?? []) {
						if (p.in !== 'path') continue;
						expect(op.path.includes(`{${p.name}}`)).toBe(true);
					}
				}
			});
		}
	});
});
