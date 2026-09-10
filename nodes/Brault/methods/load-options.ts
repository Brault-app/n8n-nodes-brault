import type { ILoadOptionsFunctions, INodePropertyOptions } from 'n8n-workflow';

export type LoadOptionsMethod = (this: ILoadOptionsFunctions) => Promise<INodePropertyOptions[]>;

// Task 12 adds getPropertyOptions here; until then no loadOptions methods are wired.
export const loadOptions = {} satisfies Record<string, LoadOptionsMethod>;
