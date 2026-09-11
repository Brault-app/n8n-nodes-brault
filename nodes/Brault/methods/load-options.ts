import type { ILoadOptionsFunctions, INodePropertyOptions } from 'n8n-workflow';

export type LoadOptionsMethod = (this: ILoadOptionsFunctions) => Promise<INodePropertyOptions[]>;

// No dynamic load-options methods yet; listSearch covers the resource locators.
export const loadOptions = {} satisfies Record<string, LoadOptionsMethod>;
