import type { IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import type { HttpMethod, Plane } from '../transport/request';

// One definition per concept: the transport layer owns Plane and HttpMethod.
export type { HttpMethod, Plane } from '../transport/request';

export type ParamIn = 'path' | 'query' | 'body';

export type LocatorKind = 'library' | 'folder' | 'file' | 'board' | 'page' | 'property';

export interface ParamSpec {
	/** API field name or path placeholder name; also the n8n parameter name */
	name: string;
	displayName: string;
	in: ParamIn;
	type: 'string' | 'number' | 'boolean' | 'options' | 'multiOptions' | 'json' | 'dateTime';
	required?: boolean;
	/** Always present: the n8n community-package scanner flags any node-parameter-shaped
	 * literal (displayName + name + type) that lacks one, and `build-properties.ts` needs
	 * a real value to render anyway. */
	default: unknown;
	description?: string;
	placeholder?: string;
	options?: Array<{ name: string; value: string; description?: string }>;
	/** Renders a Resource Locator (From List / By ID) */
	locator?: LocatorKind;
	/** A string typed as "a, b" becomes an array of trimmed strings */
	csv?: boolean;
	/** Merged into the rendered property's `displayOptions.show`, alongside resource/operation */
	showWhen?: Record<string, unknown[]>;
}

export interface OperationSpec {
	resource: string;
	operation: string;
	name: string;
	action: string;
	description: string;
	method: HttpMethod;
	plane: Plane;
	/** Uses {name} placeholders resolved from params with `in: 'path'` */
	path: string;
	/** Top-level inputs */
	params?: ParamSpec[];
	/** Optional inputs inside the "Additional Fields" collection */
	fields?: ParamSpec[];
	/** Get Many semantics: adds Return All / Limit and paginates with getAll */
	list?: boolean;
	/** Overrides the generic runner */
	custom?: CustomHandler;
}

export type CustomHandler = (
	ctx: IExecuteFunctions,
	itemIndex: number,
	spec: OperationSpec,
) => Promise<INodeExecutionData[]>;

export interface ResourceSpec {
	value: string;
	name: string;
	description: string;
	operations: OperationSpec[];
}
