import type { IExecuteFunctions, IHookFunctions, ILoadOptionsFunctions, IWebhookFunctions } from 'n8n-workflow';

export type TransportContext = IExecuteFunctions | IHookFunctions | IWebhookFunctions | ILoadOptionsFunctions;
export interface BraultHosts { central: string; regional: string }
export interface BraultCredentials { apiKey: string; baseUrl: string }

const TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { hosts: BraultHosts; expiresAt: number }>();

export function clearHostsCache(): void { cache.clear(); }

export function normalizeBaseUrl(raw: string | undefined): string {
	const value = (raw ?? '').trim() || 'https://api.brault.app';
	return value.replace(/\/+$/, '');
}

export async function getBraultCredentials(ctx: TransportContext): Promise<BraultCredentials> {
	const c = (await ctx.getCredentials('braultApi')) as { apiKey?: string; baseUrl?: string };
	return { apiKey: String(c.apiKey ?? ''), baseUrl: normalizeBaseUrl(c.baseUrl) };
}

export async function resolveHosts(ctx: TransportContext): Promise<BraultHosts> {
	const { apiKey, baseUrl } = await getBraultCredentials(ctx);
	const cacheKey = `${baseUrl}|${apiKey.slice(0, 16)}`;
	const hit = cache.get(cacheKey);
	if (hit && hit.expiresAt > Date.now()) return hit.hosts;
	let hosts: BraultHosts = { central: baseUrl, regional: baseUrl };
	try {
		const res = (await ctx.helpers.httpRequestWithAuthentication.call(ctx, 'braultApi', {
			method: 'GET', url: `${baseUrl}/v1/me`, json: true, returnFullResponse: true, ignoreHttpStatusErrors: true,
		})) as { statusCode: number; body?: { hosts?: Partial<BraultHosts>; data?: { hosts?: Partial<BraultHosts> } } };
		// GET /v1/me answers a flat object (`{ object: 'me', …, hosts }`); `data.hosts` is only a legacy fallback.
		const h = res.statusCode === 200 ? (res.body?.hosts ?? res.body?.data?.hosts) : undefined;
		if (h?.central && h?.regional) hosts = { central: h.central, regional: h.regional };
	} catch {
		// keep the fallback: one origin serves both planes today (conventions.md § Host and versioning)
	}
	cache.set(cacheKey, { hosts, expiresAt: Date.now() + TTL_MS });
	return hosts;
}
