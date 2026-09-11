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

			it(`${r.value}: every boolean param/field has a description starting with "Whether"`, () => {
				for (const op of r.operations) {
					for (const p of [...(op.params ?? []), ...(op.fields ?? [])]) {
						if (p.type !== 'boolean') continue;
						expect(p.description).toBeDefined();
						expect(p.description).toMatch(/^Whether/);
					}
				}
			});

			it(`${r.value}: no param/field description ends with a period`, () => {
				for (const op of r.operations) {
					for (const p of [...(op.params ?? []), ...(op.fields ?? [])]) {
						if (!p.description) continue;
						expect(p.description.endsWith('.')).toBe(false);
					}
				}
			});

			it(`${r.value}: no description, name, action, or displayName contains an em dash or en dash`, () => {
				for (const op of r.operations) {
					expect(op.name).not.toMatch(/[—–]/);
					expect(op.action).not.toMatch(/[—–]/);
					expect(op.description).not.toMatch(/[—–]/);
					for (const p of [...(op.params ?? []), ...(op.fields ?? [])]) {
						expect(p.displayName).not.toMatch(/[—–]/);
						if (p.description) expect(p.description).not.toMatch(/[—–]/);
					}
				}
			});

			// n8n's community-package scanner (`@n8n/scan-community-package`) runs its own
			// strict eslint-plugin-n8n-nodes-base config against the published source and
			// ignores our inline eslint-disable comments, so every param/field literal must
			// carry an explicit `default` whose type matches its declared `type` (see
			// catalogue/common-params.ts and specs/plans/2026-09-10-n8n-node.md step "scanner
			// fix"). This guards the whole catalogue, not just the object literals that used
			// to be exempted.
			it(`${r.value}: every param/field declares an explicit default whose type matches its declared type`, () => {
				for (const op of r.operations) {
					for (const p of [...(op.params ?? []), ...(op.fields ?? [])]) {
						expect(p.default).not.toBeUndefined();
						switch (p.type) {
							case 'boolean':
								expect(typeof p.default).toBe('boolean');
								break;
							case 'number':
								expect(typeof p.default).toBe('number');
								break;
							case 'multiOptions':
								expect(Array.isArray(p.default)).toBe(true);
								break;
							case 'options':
								expect(p.options?.some((o) => o.value === p.default)).toBe(true);
								break;
							default:
								// string, dateTime, json, and locator params (always typed
								// 'string' here) all default to ''.
								expect(typeof p.default).toBe('string');
						}
					}
				}
			});
		}
	});
});
