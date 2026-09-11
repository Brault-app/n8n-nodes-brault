/**
 * Shared harness for the headless smoke scripts.
 *
 * Everything here is transport plumbing: a minimal fake n8n execution context over the
 * built `dist/` code, a raw API client for probes and cleanup, and the PASS/FAIL bookkeeping.
 * No scenario lives in this file — `smoke-stg.mjs` and `smoke-full.mjs` own their own flows.
 *
 * Credentials come from the environment; when a variable is missing it is read from an env
 * file (default `~/.config/brault/n8n-stg.env`, overridable with BRAULT_SMOKE_ENV_FILE).
 * Sourcing an env file in the shell therefore always wins over the file on disk:
 *   source ~/.config/brault/n8n-prod.env && node scripts/smoke-full.mjs
 */

import { createRequire } from 'node:module';
import { Readable } from 'node:stream';
import { deflateSync } from 'node:zlib';
import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const require = createRequire(import.meta.url);
export const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

// ---------------------------------------------------------------- credentials

export function loadEnvFile(path) {
	if (!existsSync(path)) return false;
	for (const raw of readFileSync(path, 'utf8').split('\n')) {
		const line = raw.trim();
		if (!line || line.startsWith('#')) continue;
		const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
		if (!m) continue;
		let value = m[2].trim();
		if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
			value = value.slice(1, -1);
		if (process.env[m[1]] === undefined) process.env[m[1]] = value;
	}
	return true;
}

/** Resolves { apiKey, baseUrl } from the environment, falling back to an env file. */
export function loadCredentials() {
	const envFile = process.env.BRAULT_SMOKE_ENV_FILE ?? join(homedir(), '.config', 'brault', 'n8n-stg.env');
	loadEnvFile(envFile);
	const apiKey = process.env.BRAULT_STG_API_KEY ?? '';
	const baseUrl = (process.env.BRAULT_STG_API_BASE ?? 'https://api.stg.brault.app').replace(/\/+$/, '');
	if (!apiKey) {
		console.error(`Missing BRAULT_STG_API_KEY (source an env file first, e.g. ${envFile})`);
		process.exit(2);
	}
	return { apiKey, baseUrl, envFile };
}

// ------------------------------------------------------------- built node code

export function loadBuiltNodes() {
	const { Brault } = require(join(ROOT, 'dist/nodes/Brault/Brault.node.js'));
	const { BraultTrigger } = require(join(ROOT, 'dist/nodes/BraultTrigger/BraultTrigger.node.js'));
	const catalogue = require(join(ROOT, 'dist/nodes/Brault/catalogue/index.js'));
	return { braultNode: new Brault(), triggerNode: new BraultTrigger(), catalogue };
}

// ------------------------------------------------------------------ utilities

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** n8n resourceLocator shape, as the node's `extractValue` expects it. */
export const rl = (value) => ({ __rl: true, mode: 'id', value });
export const one = (rows) => (rows && rows.length ? rows[0].json : {});

function lowerHeaders(headers) {
	const out = {};
	headers.forEach((v, k) => {
		out[k.toLowerCase()] = v;
	});
	return out;
}

async function collect(stream) {
	const chunks = [];
	for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
	return Buffer.concat(chunks);
}

export function describeError(e) {
	if (!e) return 'unknown error';
	const parts = [String(e.message ?? e)];
	if (e.description) parts.push(`description="${e.description}"`);
	if (e.httpCode) parts.push(`http=${e.httpCode}`);
	const cause = e.cause;
	if (cause && typeof cause === 'object') {
		const err = cause.error ?? cause;
		const bits = [];
		if (err.code) bits.push(`code=${err.code}`);
		if (err.request_id) bits.push(`request_id=${err.request_id}`);
		if (err.details) bits.push(`details=${JSON.stringify(err.details).slice(0, 200)}`);
		if (!bits.length) bits.push(JSON.stringify(cause).slice(0, 300));
		parts.push(`cause{${bits.join(' ')}}`);
	}
	return parts.join(' · ');
}

// ------------------------------------------------------------------- test PNG

function crc32(buf) {
	let c;
	const table =
		crc32.table ??
		(crc32.table = Array.from({ length: 256 }, (_, n) => {
			c = n;
			for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
			return c >>> 0;
		}));
	let crc = 0xffffffff;
	for (const byte of buf) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
	return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
	const len = Buffer.alloc(4);
	len.writeUInt32BE(data.length);
	const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
	const crc = Buffer.alloc(4);
	crc.writeUInt32BE(crc32(body));
	return Buffer.concat([len, body, crc]);
}

/** A valid truecolour PNG, generated so the smoke needs no fixture on disk. */
export function makePng(size = 24, tint = 0x7f) {
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(size, 0);
	ihdr.writeUInt32BE(size, 4);
	ihdr[8] = 8; // bit depth
	ihdr[9] = 2; // colour type: truecolour
	const raw = Buffer.alloc(size * (size * 3 + 1));
	let o = 0;
	for (let y = 0; y < size; y++) {
		raw[o++] = 0; // filter: none
		for (let x = 0; x < size; x++) {
			raw[o++] = (x * 10) % 256;
			raw[o++] = (y * 10) % 256;
			raw[o++] = tint;
		}
	}
	return Buffer.concat([
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		chunk('IHDR', ihdr),
		chunk('IDAT', deflateSync(raw)),
		chunk('IEND', Buffer.alloc(0)),
	]);
}

/** Wraps a buffer as the single binary item an n8n node would receive. */
export function binaryItems(buffer, fileName = 'smoke.png', mimeType = 'image/png') {
	return [
		{
			json: {},
			binary: {
				data: {
					data: buffer.toString('base64'),
					fileName,
					mimeType,
					fileSize: String(buffer.length),
				},
			},
		},
	];
}

// ------------------------------------------------------------------- context

const FAKE_NODE = {
	id: 'smoke-node',
	name: 'Brault',
	type: 'n8n-nodes-brault.brault',
	typeVersion: 1,
	position: [0, 0],
	parameters: {},
};

/**
 * Builds the harness: a fake n8n execution context wired to real HTTP, plus a raw
 * `api()` client that shares the same key and the discovered hosts.
 */
export function createHarness({ apiKey, baseUrl }) {
	const { braultNode, triggerNode, catalogue } = loadBuiltNodes();
	const staticData = {};
	const state = { hosts: { central: baseUrl, regional: baseUrl }, webhookUrl: null };

	/** Minimal stand-in for n8n's helpers.httpRequest / httpRequestWithAuthentication. */
	async function doFetch(options, withAuth) {
		const url = new URL(options.url);
		if (options.qs) {
			for (const [k, v] of Object.entries(options.qs)) {
				if (v === undefined || v === null) continue;
				if (Array.isArray(v)) v.forEach((x) => url.searchParams.append(k, String(x)));
				else url.searchParams.append(k, String(v));
			}
		}

		const headers = {};
		for (const [k, v] of Object.entries(options.headers ?? {})) {
			// undici sets Content-Length itself; passing it through can be rejected by fetch.
			if (k.toLowerCase() === 'content-length') continue;
			headers[k] = String(v);
		}
		if (withAuth) headers.Authorization = `Bearer ${apiKey}`;

		const init = { method: options.method ?? 'GET', headers, redirect: 'follow' };
		const body = options.body;
		if (body !== undefined && body !== null && init.method !== 'GET' && init.method !== 'HEAD') {
			if (Buffer.isBuffer(body)) {
				init.body = body;
			} else if (typeof body.pipe === 'function' || body instanceof Readable) {
				init.body = Readable.toWeb(body);
				init.duplex = 'half';
			} else if (typeof body === 'string') {
				init.body = body;
			} else {
				init.body = JSON.stringify(body);
				if (!Object.keys(headers).some((h) => h.toLowerCase() === 'content-type'))
					headers['Content-Type'] = 'application/json';
			}
		}

		const res = await fetch(url, init);
		const outHeaders = lowerHeaders(res.headers);

		let data;
		if (options.encoding === 'arraybuffer') {
			data = Buffer.from(await res.arrayBuffer());
		} else if (options.encoding === 'stream') {
			data = res.body ? Readable.fromWeb(res.body) : Readable.from([]);
		} else {
			const text = await res.text();
			const ct = outHeaders['content-type'] ?? '';
			if (text === '') data = undefined;
			else if (options.json === true || ct.includes('json')) {
				try {
					data = JSON.parse(text);
				} catch {
					data = text;
				}
			} else data = text;
		}

		if (!options.ignoreHttpStatusErrors && (res.status < 200 || res.status >= 300)) {
			const preview = typeof data === 'string' ? data.slice(0, 300) : JSON.stringify(data ?? {}).slice(0, 300);
			const err = new Error(`HTTP ${res.status} on ${init.method} ${url.origin}${url.pathname}: ${preview}`);
			err.statusCode = res.status;
			throw err;
		}

		if (options.returnFullResponse) return { statusCode: res.status, headers: outHeaders, body: data };
		return data;
	}

	function makeHelpers(items) {
		return {
			async httpRequestWithAuthentication(_name, options) {
				return doFetch(options, true);
			},
			async httpRequest(options) {
				return doFetch(options, false);
			},
			returnJsonArray(data) {
				return (Array.isArray(data) ? data : [data]).map((json) => ({ json }));
			},
			assertBinaryData(i, property) {
				const b = items?.[i]?.binary?.[property];
				if (!b) throw new Error(`The item has no binary property "${property}"`);
				return b;
			},
			async getBinaryDataBuffer(i, property) {
				const b = items[i].binary[property];
				return Buffer.from(b.data, 'base64');
			},
			async prepareBinaryData(source, fileName, mimeType) {
				const buf = Buffer.isBuffer(source) ? source : await collect(source);
				return {
					data: buf.toString('base64'),
					fileName,
					mimeType: mimeType ?? 'application/octet-stream',
					fileSize: String(buf.length),
				};
			},
			async getBinaryMetadata() {
				throw new Error('getBinaryMetadata should not be reached: smoke binaries carry no id');
			},
			async getBinaryStream() {
				throw new Error('getBinaryStream should not be reached: smoke binaries carry no id');
			},
		};
	}

	function makeCtx(params, items = [{ json: {} }]) {
		const helpers = makeHelpers(items);
		return {
			getInputData: () => items,
			getNodeParameter(name, _i, fallback, opts) {
				let v = Object.prototype.hasOwnProperty.call(params, name) ? params[name] : fallback;
				if (opts && opts.extractValue && v && typeof v === 'object' && 'value' in v) v = v.value;
				return v;
			},
			getNode: () => FAKE_NODE,
			continueOnFail: () => false,
			async getCredentials() {
				return { apiKey, baseUrl };
			},
			getWorkflowStaticData: () => staticData,
			getNodeWebhookUrl: () => state.webhookUrl,
			getWorkflow: () => ({ name: 'smoke' }),
			getTimezone: () => 'UTC',
			helpers,
		};
	}

	/** Runs one catalogue operation through the real Brault.execute(). */
	async function run(resource, operation, params = {}, items) {
		const ctx = makeCtx({ resource, operation, ...params }, items);
		const out = await braultNode.execute.call(ctx);
		return out[0];
	}

	/** Direct API call, bypassing the node, for probes and cleanup. */
	async function api(method, path, { body, qs, plane = 'regional' } = {}) {
		const base = plane === 'central' ? state.hosts.central : state.hosts.regional;
		return doFetch(
			{
				method,
				url: `${base}${path}`,
				qs,
				body,
				json: true,
				headers: { Accept: 'application/json' },
				returnFullResponse: true,
				ignoreHttpStatusErrors: true,
			},
			true,
		);
	}

	/** Host discovery, exactly as transport/hosts.ts does it. */
	async function discoverHosts() {
		const me = await doFetch(
			{
				method: 'GET',
				url: `${baseUrl}/v1/me`,
				json: true,
				returnFullResponse: true,
				ignoreHttpStatusErrors: true,
			},
			true,
		);
		// /v1/me answers a flat object: { object: 'me', brandspace, key, plan, limits, hosts }.
		const meHosts = me.body?.hosts ?? me.body?.data?.hosts;
		if (me.statusCode === 200 && meHosts?.central && meHosts?.regional) state.hosts = meHosts;
		return { hosts: state.hosts, me: me.body };
	}

	return {
		braultNode,
		triggerNode,
		catalogue,
		staticData,
		state,
		doFetch,
		makeCtx,
		run,
		api,
		discoverHosts,
		get hosts() {
			return state.hosts;
		},
		get webhookUrl() {
			return state.webhookUrl;
		},
		setWebhookUrl(url) {
			state.webhookUrl = url;
		},
	};
}

/**
 * PASS/FAIL recorder. `pauseMs` is applied before every check so the run stays inside the
 * plan's rate limits (Pro on production is 10 req/s, 300/min; one check can spend several).
 */
export function createRecorder({ pauseMs = 300 } = {}) {
	const results = [];
	async function check(name, fn) {
		await sleep(pauseMs);
		try {
			const detail = await fn();
			results.push({ name, ok: true, detail: detail ?? '' });
			console.log(`PASS ${name}${detail ? ` — ${detail}` : ''}`);
			return true;
		} catch (e) {
			const msg = describeError(e);
			results.push({ name, ok: false, detail: msg });
			console.log(`FAIL ${name}: ${msg}`);
			return false;
		}
	}
	return { results, check };
}
