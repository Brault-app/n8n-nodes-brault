import type { ILoadOptionsFunctions, INodeListSearchResult } from 'n8n-workflow';

export type ListSearchMethod = (
	this: ILoadOptionsFunctions,
	filter?: string,
	paginationToken?: string,
) => Promise<INodeListSearchResult>;

// Task 9 fills this map with searchLibraries, searchFolders, searchFiles, searchBoards,
// searchPages and searchProperties; until then the "From List" locator mode stays empty.
export const listSearch: Record<string, ListSearchMethod> = {};
