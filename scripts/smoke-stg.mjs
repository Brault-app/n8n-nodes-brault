#!/usr/bin/env node
/**
 * Headless end-to-end smoke of the built Brault n8n nodes against a real Brault API.
 *
 * Runs `dist/` code (never the TypeScript sources) through a minimal fake n8n execution
 * context, so every check exercises the same transport, catalogue and custom handlers an
 * n8n instance would run. Each check prints PASS/FAIL and the script keeps going; the
 * process exits 1 when any check failed.
 *
 * Usage:
 *   source ~/.config/brault/n8n-stg.env && node scripts/smoke-stg.mjs
 * Environment:
 *   BRAULT_STG_API_KEY   API key (bsk_…) with every scope
 *   BRAULT_STG_API_BASE  central base URL, e.g. https://api.stg.brault.app
 */

import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { deflateSync } from 'node:zlib';
import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const require = createRequire(import.meta.url);
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

// ---------------------------------------------------------------- credentials

function loadEnvFile(path) {
	if (!existsSync(path)) return;
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
}

loadEnvFile(join(homedir(), '.config', 'brault', 'n8n-stg.env'));

const API_KEY = process.env.BRAULT_STG_API_KEY ?? '';
const BASE_URL = (process.env.BRAULT_STG_API_BASE ?? 'https://api.stg.brault.app').replace(/\/+$/, '');
if (!API_KEY) {
	console.error('Missing BRAULT_STG_API_KEY (source ~/.config/brault/n8n-stg.env first)');
	process.exit(2);
}

// ------------------------------------------------------------- built node code

const { Brault } = require(join(ROOT, 'dist/nodes/Brault/Brault.node.js'));
const { BraultTrigger } = require(join(ROOT, 'dist/nodes/BraultTrigger/BraultTrigger.node.js'));
const catalogue = require(join(ROOT, 'dist/nodes/Brault/catalogue/index.js'));

const braultNode = new Brault();
const triggerNode = new BraultTrigger();

// ------------------------------------------------------------------ utilities

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rl = (value) => ({ __rl: true, mode: 'id', value });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');

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
	if (withAuth) headers.Authorization = `Bearer ${API_KEY}`;

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

const FAKE_NODE = {
	id: 'smoke-node',
	name: 'Brault',
	type: 'n8n-nodes-brault.brault',
	typeVersion: 1,
	position: [0, 0],
	parameters: {},
};

const staticData = {};
let webhookUrl = `https://smoke.invalid/webhook/${randomUUID()}`;

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
			return { apiKey: API_KEY, baseUrl: BASE_URL };
		},
		getWorkflowStaticData: () => staticData,
		getNodeWebhookUrl: () => webhookUrl,
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

const one = (rows) => (rows && rows.length ? rows[0].json : {});

/** Direct API call, bypassing the node, for probes and cleanup. */
async function api(method, path, { body, qs, plane = 'regional' } = {}) {
	const base = plane === 'central' ? hosts.central : hosts.regional;
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

function describeError(e) {
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

const results = [];
async function check(name, fn) {
	await sleep(300);
	try {
		const detail = await fn();
		results.push({ name, ok: true, detail: detail ?? '' });
		console.log(`PASS ${name}${detail ? ` — ${detail}` : ''}`);
	} catch (e) {
		const msg = describeError(e);
		results.push({ name, ok: false, detail: msg });
		console.log(`FAIL ${name}: ${msg}`);
	}
}

// ------------------------------------------------------------------- test PNG

function crc32(buf) {
	let c;
	const table = crc32.table ?? (crc32.table = Array.from({ length: 256 }, (_, n) => {
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

function makePng(size = 24) {
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
			raw[o++] = 0x7f;
		}
	}
	return Buffer.concat([
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		chunk('IHDR', ihdr),
		chunk('IDAT', deflateSync(raw)),
		chunk('IEND', Buffer.alloc(0)),
	]);
}

const PNG = makePng(24);
const pngItems = () => [
	{
		json: {},
		binary: {
			data: {
				data: PNG.toString('base64'),
				fileName: 'smoke.png',
				mimeType: 'image/png',
				fileSize: String(PNG.length),
			},
		},
	},
];

// --------------------------------------------------------------------- state

let hosts = { central: BASE_URL, regional: BASE_URL };
const state = {
	libraryId: null,
	folderId: null,
	fileId: null,
	importedFileId: null,
	commentId: null,
	boardId: null,
	boardPropertyId: null,
	boardOptionId: null,
	sharedLinkId: null,
	pageId: null,
	transferId: null,
	downloadId: null,
	webhookId: null,
	uploadProbe: null,
	leftBehind: [],
};

// ---------------------------------------------------------------------- main

async function main() {
	console.log(`# n8n-nodes-brault staging smoke — ${new Date().toISOString()}`);
	console.log(`# central base: ${BASE_URL}`);

	// Host discovery, exactly as transport/hosts.ts does it.
	const me = await doFetch(
		{ method: 'GET', url: `${BASE_URL}/v1/me`, json: true, returnFullResponse: true, ignoreHttpStatusErrors: true },
		true,
	);
	// /v1/me answers a flat object: { object: 'me', brandspace, key, plan, limits, hosts }.
	const meHosts = me.body?.hosts ?? me.body?.data?.hosts;
	if (me.statusCode === 200 && meHosts?.central && meHosts?.regional) {
		hosts = meHosts;
	}
	console.log(`# hosts: central=${hosts.central} regional=${hosts.regional}`);

	// 1 — brandspace
	await check('1a brandspace.get', async () => {
		const b = one(await run('brandspace', 'get'));
		if (!b.id) throw new Error(`no id in response: ${JSON.stringify(b).slice(0, 200)}`);
		return `${b.name ?? b.slug ?? b.id} (${b.region ?? 'region?'})`;
	});
	await check('1b brandspace.getUsage', async () => {
		const u = one(await run('brandspace', 'getUsage'));
		const keys = Object.keys(u);
		if (!keys.length) throw new Error('empty usage body');
		return `keys: ${keys.join(', ')}`;
	});

	// 2 — libraries
	await check('2 library.getAll returnAll', async () => {
		const rows = await run('library', 'getAll', { returnAll: true });
		if (!rows.length) throw new Error('no libraries visible to the key');
		state.libraryId = rows[0].json.id;
		return `${rows.length} librar${rows.length === 1 ? 'y' : 'ies'}, first=${state.libraryId}`;
	});

	// 3 — folders
	const folderName = `n8n smoke ${stamp}`;
	await check('3a folder.create', async () => {
		if (!state.libraryId) throw new Error('skipped: no libraryId');
		const f = one(
			await run('folder', 'create', { name: folderName, additionalFields: { library_id: rl(state.libraryId) } }),
		);
		if (!f.id) throw new Error(`no id: ${JSON.stringify(f).slice(0, 200)}`);
		state.folderId = f.id;
		return `id=${f.id} name=${f.name}`;
	});
	await check('3b folder.get', async () => {
		if (!state.folderId) throw new Error('skipped: no folderId');
		const f = one(await run('folder', 'get', { folderId: rl(state.folderId) }));
		if (f.id !== state.folderId) throw new Error(`got id ${f.id}`);
		return `name=${f.name}`;
	});
	await check('3c folder.update rename', async () => {
		if (!state.folderId) throw new Error('skipped: no folderId');
		const f = one(
			await run('folder', 'update', {
				folderId: rl(state.folderId),
				additionalFields: { name: `${folderName} renamed` },
			}),
		);
		if (f.name !== `${folderName} renamed`) throw new Error(`name is ${f.name}`);
		return `name=${f.name}`;
	});

	// 4 — upload
	await check('4a POST /v1/uploads probe (session shape)', async () => {
		// Raw API call: the route takes exactly one of library_id, folder_id, file_id.
		const destination = state.folderId
			? { folder_id: state.folderId }
			: state.libraryId
				? { library_id: state.libraryId }
				: {};
		const res = await api('POST', '/v1/uploads', {
			body: { name: 'smoke-probe.png', size: PNG.length, ...destination },
		});
		if (res.statusCode < 200 || res.statusCode >= 300)
			throw new Error(`HTTP ${res.statusCode}: ${JSON.stringify(res.body).slice(0, 300)}`);
		const session = res.body?.data ?? res.body;
		state.uploadProbe = {
			keys: Object.keys(session),
			method: session.method,
			hasContentType: Object.prototype.hasOwnProperty.call(session, 'content_type'),
			contentType: session.content_type ?? null,
		};
		// Abort the probe session so it is not left dangling.
		if (session.id) await api('POST', `/v1/uploads/${session.id}/abort`).catch(() => {});
		return `keys=[${state.uploadProbe.keys.join(', ')}] method=${session.method} content_type=${
			state.uploadProbe.hasContentType ? JSON.stringify(session.content_type) : 'ABSENT'
		}`;
	});
	// The ONE check that deliberately fills in both destinations: the node must collapse them
	// to folder_id alone (normalizeDestination), because the API refuses a body naming two.
	await check('4b file.upload (24x24 PNG, library + folder both set on purpose)', async () => {
		const f = one(
			await run(
				'file',
				'upload',
				{
					binaryProperty: 'data',
					additionalFields: {
						name: 'smoke.png',
						...(state.libraryId ? { library_id: rl(state.libraryId) } : {}),
						...(state.folderId ? { folder_id: rl(state.folderId) } : {}),
					},
				},
				pngItems(),
			),
		);
		if (!f.id) throw new Error(`no id: ${JSON.stringify(f).slice(0, 300)}`);
		state.fileId = f.id;
		if (!f.name) throw new Error('no name on the created file');
		return `id=${f.id} name=${f.name} status=${f.status ?? '(none)'} size=${f.size ?? '?'}`;
	});

	// 5 — file reads / updates / download
	await check('5a file.getAll folder filter', async () => {
		if (!state.folderId) throw new Error('skipped: no folderId');
		const rows = await run('file', 'getAll', {
			returnAll: false,
			limit: 100,
			additionalFields: { folder_id: rl(state.folderId) },
		});
		const ids = rows.map((r) => r.json.id);
		if (state.fileId && !ids.includes(state.fileId)) throw new Error(`uploaded file not listed (got ${ids.length} rows)`);
		return `${rows.length} file(s)`;
	});
	await check('5b file.get', async () => {
		if (!state.fileId) throw new Error('skipped: no fileId');
		const f = one(await run('file', 'get', { fileId: rl(state.fileId) }));
		if (f.id !== state.fileId) throw new Error(`got id ${f.id}`);
		return `name=${f.name} mime=${f.mime ?? '?'} status=${f.status ?? '?'}`;
	});
	await check('5c file.update tags', async () => {
		if (!state.fileId) throw new Error('skipped: no fileId');
		const f = one(await run('file', 'update', { fileId: rl(state.fileId), additionalFields: { tags: 'smoke' } }));
		const tags = JSON.stringify(f.tags ?? null);
		if (!tags.includes('smoke')) throw new Error(`tags are ${tags}`);
		return `tags=${tags}`;
	});
	await check('5d file.getDownloadUrl', async () => {
		if (!state.fileId) throw new Error('skipped: no fileId');
		const l = one(await run('file', 'getDownloadUrl', { fileId: rl(state.fileId), additionalFields: {} }));
		if (!l.url) throw new Error(`no url: ${JSON.stringify(l).slice(0, 200)}`);
		return `url host=${new URL(l.url).host}`;
	});
	await check('5e file.download binary', async () => {
		if (!state.fileId) throw new Error('skipped: no fileId');
		const rows = await run('file', 'download', {
			fileId: rl(state.fileId),
			binaryProperty: 'data',
			additionalFields: {},
		});
		const bin = rows[0]?.binary?.data;
		if (!bin) throw new Error('no binary property on the output item');
		const len = Buffer.from(bin.data, 'base64').length;
		if (len === 0) throw new Error('downloaded 0 bytes');
		if (len !== PNG.length) throw new Error(`downloaded ${len} bytes, uploaded ${PNG.length}`);
		return `${len} bytes, fileName=${bin.fileName} mime=${bin.mimeType}`;
	});

	// 6 — import from URL
	await check('6 file.importFromUrl wait=true', async () => {
		const params = {
			url: 'https://www.w3.org/Icons/w3c_home.png',
			additionalFields: {
				wait: true,
				name: `smoke-import-${stamp}.ico`,
				// exactly one destination: the folder already implies its library
				...(state.folderId ? { folder_id: rl(state.folderId) } : state.libraryId ? { library_id: rl(state.libraryId) } : {}),
			},
		};
		const opPromise = run('file', 'importFromUrl', params);
		opPromise.catch(() => {}); // the loser of the race must not reject globally
		const TIMEOUT = 120_000;
		const timeout = Symbol('timeout');
		const raced = await Promise.race([opPromise, sleep(TIMEOUT).then(() => timeout)]);
		if (raced === timeout) throw new Error(`import did not finish within ${TIMEOUT / 1000}s (node waits up to 10 min)`);
		const f = one(raced);
		if (!f.id) throw new Error(`no file returned: ${JSON.stringify(f).slice(0, 300)}`);
		state.importedFileId = f.id;
		return `id=${f.id} name=${f.name} status=${f.status ?? '?'}`;
	});

	// 7 — comments
	await check('7a comment.create', async () => {
		if (!state.fileId) throw new Error('skipped: no fileId');
		const c = one(
			await run('comment', 'create', { fileId: rl(state.fileId), text: 'smoke comment', additionalFields: {} }),
		);
		if (!c.id) throw new Error(`no id: ${JSON.stringify(c).slice(0, 200)}`);
		state.commentId = c.id;
		return `id=${c.id}`;
	});
	await check('7b comment.getAll', async () => {
		if (!state.fileId) throw new Error('skipped: no fileId');
		const rows = await run('comment', 'getAll', { fileId: rl(state.fileId), returnAll: false, limit: 50, additionalFields: {} });
		if (state.commentId && !rows.some((r) => r.json.id === state.commentId)) throw new Error('created comment not listed');
		return `${rows.length} comment(s)`;
	});
	await check('7c reply.create', async () => {
		if (!state.commentId) throw new Error('skipped: no commentId');
		const r = one(
			await run('reply', 'create', { fileId: rl(state.fileId), commentId: state.commentId, text: 'smoke reply' }),
		);
		if (!r.id) throw new Error(`no id: ${JSON.stringify(r).slice(0, 200)}`);
		return `id=${r.id}`;
	});
	await check('7d comment.resolve', async () => {
		if (!state.commentId) throw new Error('skipped: no commentId');
		const c = one(await run('comment', 'resolve', { fileId: rl(state.fileId), commentId: state.commentId }));
		return `resolved=${JSON.stringify(c.resolved ?? c.completed ?? null)}`;
	});
	await check('7e comment.delete', async () => {
		if (!state.commentId) throw new Error('skipped: no commentId');
		const d = one(await run('comment', 'delete', { fileId: rl(state.fileId), commentId: state.commentId }));
		state.commentId = null;
		return `deleted=${JSON.stringify(d).slice(0, 120)}`;
	});

	// 8 — boards
	await check('8a board.create', async () => {
		const b = one(await run('board', 'create', { name: `n8n smoke board ${stamp}`, additionalFields: {} }));
		if (!b.id) throw new Error(`no id: ${JSON.stringify(b).slice(0, 200)}`);
		state.boardId = b.id;
		return `id=${b.id}`;
	});
	await check('8b board.addFiles', async () => {
		if (!state.boardId || !state.fileId) throw new Error('skipped: no boardId/fileId');
		const r = one(await run('board', 'addFiles', { boardId: rl(state.boardId), file_ids: state.fileId }));
		return JSON.stringify(r).slice(0, 160);
	});
	await check('8c board.query', async () => {
		if (!state.boardId) throw new Error('skipped: no boardId');
		const rows = await run('board', 'query', {
			boardId: rl(state.boardId),
			returnAll: false,
			limit: 50,
			additionalFields: {},
		});
		// Rows are `board_file` objects: the file lives under `file` (boards.md §3.4).
		if (state.fileId && !rows.some((r) => r.json.file?.id === state.fileId || r.json.id === state.fileId))
			throw new Error(`added file not in the board query (${rows.length} rows)`);
		return `${rows.length} row(s)`;
	});
	await check('8d boardProperty.create status', async () => {
		if (!state.boardId) throw new Error('skipped: no boardId');
		const p = one(
			await run('boardProperty', 'create', {
				boardId: rl(state.boardId),
				name: 'Smoke status',
				type: 'status',
				additionalFields: { options: JSON.stringify([{ label: 'Todo' }, { label: 'Done' }]) },
			}),
		);
		if (!p.id) throw new Error(`no id: ${JSON.stringify(p).slice(0, 250)}`);
		state.boardPropertyId = p.id;
		const options = p.options ?? p.select_options ?? [];
		state.boardOptionId = options[0]?.id ?? null;
		if (!state.boardOptionId) throw new Error(`no option ids returned: ${JSON.stringify(p).slice(0, 250)}`);
		return `property=${p.id} options=${options.map((o) => `${o.label}:${o.id}`).join(', ')}`;
	});
	await check('8e board.setFileProperty status', async () => {
		if (!state.boardPropertyId || !state.boardOptionId) throw new Error('skipped: no property/option');
		const r = one(
			await run('board', 'setFileProperty', {
				boardId: rl(state.boardId),
				fileId: rl(state.fileId),
				propertyId: state.boardPropertyId,
				valueType: 'status',
				option_id: state.boardOptionId,
			}),
		);
		return JSON.stringify(r).slice(0, 160);
	});
	await check('8f board.setFileProperty clear', async () => {
		if (!state.boardPropertyId) throw new Error('skipped: no property');
		const r = one(
			await run('board', 'setFileProperty', {
				boardId: rl(state.boardId),
				fileId: rl(state.fileId),
				propertyId: state.boardPropertyId,
				valueType: 'clear',
				clearType: 'status',
			}),
		);
		return JSON.stringify(r).slice(0, 160);
	});
	await check('8g board.delete', async () => {
		if (!state.boardId) throw new Error('skipped: no boardId');
		const d = one(await run('board', 'delete', { boardId: rl(state.boardId) }));
		state.boardId = null;
		return `deleted=${JSON.stringify(d).slice(0, 120)}`;
	});

	// 9 — properties and search
	await check('9a property.getAll', async () => {
		const rows = await run('property', 'getAll', { returnAll: false, limit: 50 });
		return `${rows.length} propert${rows.length === 1 ? 'y' : 'ies'}`;
	});
	await check('9b search.search', async () => {
		const rows = await run('search', 'search', { q: 'smoke', returnAll: false, limit: 10, additionalFields: {} });
		return `${rows.length} hit(s)`;
	});

	// 10 — shared links
	await check('10a sharedLink.create', async () => {
		if (!state.fileId) throw new Error('skipped: no fileId');
		const l = one(
			await run('sharedLink', 'create', {
				targetType: 'file',
				targetId: state.fileId,
				additionalFields: { access: 'review' },
			}),
		);
		if (!l.id) throw new Error(`no id: ${JSON.stringify(l).slice(0, 250)}`);
		state.sharedLinkId = l.id;
		if (!l.url) throw new Error(`no url on the shared link: ${JSON.stringify(l).slice(0, 250)}`);
		return `id=${l.id} url=${l.url} access=${l.access ?? '?'}`;
	});
	await check('10b sharedLink.getAll', async () => {
		const rows = await run('sharedLink', 'getAll', { returnAll: false, limit: 50 });
		const listed = state.sharedLinkId ? rows.some((r) => r.json.id === state.sharedLinkId) : false;
		// File-scoped links are excluded from this list by contract (review-pages-shares.md §2.4).
		return `${rows.length} link(s); created link listed=${listed} (file links are excluded by contract)`;
	});
	await check('10c sharedLink.delete', async () => {
		if (!state.sharedLinkId) throw new Error('skipped: no sharedLinkId');
		const d = one(await run('sharedLink', 'delete', { sharedLinkId: state.sharedLinkId }));
		state.sharedLinkId = null;
		return `deleted=${JSON.stringify(d).slice(0, 120)}`;
	});

	// 11 — pages
	await check('11a page.create', async () => {
		const p = one(
			await run('page', 'create', {
				name: `n8n smoke page ${stamp}`,
				additionalFields: {
					...(state.folderId ? { folder_id: rl(state.folderId) } : {}),
					blocks: JSON.stringify([{ type: 'paragraph', text: 'hello' }]),
				},
			}),
		);
		if (!p.id) throw new Error(`no id: ${JSON.stringify(p).slice(0, 250)}`);
		state.pageId = p.id;
		return `id=${p.id} name=${p.name}`;
	});
	await check('11b page.publish', async () => {
		if (!state.pageId) throw new Error('skipped: no pageId');
		const p = one(await run('page', 'publish', { pageId: rl(state.pageId) }));
		return `published_at=${p.published_at ?? '?'} public_url=${p.public_url ?? '(none)'}`;
	});
	await check('11c page.delete permanent', async () => {
		if (!state.pageId) throw new Error('skipped: no pageId');
		const d = one(await run('page', 'delete', { pageId: rl(state.pageId), additionalFields: { permanent: true } }));
		state.pageId = null;
		return `deleted=${JSON.stringify(d).slice(0, 120)}`;
	});

	// 12 — transfers
	await check('12a transfer.create (binary + existing file)', async () => {
		const t = one(
			await run(
				'transfer',
				'create',
				{
					additionalFields: {
						binaryProperties: 'data',
						...(state.fileId ? { file_ids: state.fileId } : {}),
						expires_in_days: 1,
					},
				},
				pngItems(),
			),
		);
		if (!t.id) throw new Error(`no id: ${JSON.stringify(t).slice(0, 250)}`);
		state.transferId = t.id;
		const url = t.url ?? t.download_url ?? t.share_url;
		if (!url) throw new Error(`no url: ${JSON.stringify(t).slice(0, 250)}`);
		return `id=${t.id} url=${url} status=${t.status ?? '?'}`;
	});
	await check('12b transfer.get', async () => {
		if (!state.transferId) throw new Error('skipped: no transferId');
		const t = one(await run('transfer', 'get', { transferId: state.transferId }));
		if (t.id !== state.transferId) throw new Error(`got id ${t.id}`);
		const files = Array.isArray(t.files) ? t.files.length : '?';
		return `status=${t.status ?? '?'} files=${files}`;
	});
	await check('12c transfer.delete', async () => {
		if (!state.transferId) throw new Error('skipped: no transferId');
		const d = one(await run('transfer', 'delete', { transferId: state.transferId }));
		state.transferId = null;
		return `deleted=${JSON.stringify(d).slice(0, 120)}`;
	});

	// 13 — bulk download
	await check('13 bulkDownload.create + poll get', async () => {
		if (!state.fileId) throw new Error('skipped: no fileId');
		const d = one(await run('bulkDownload', 'create', { additionalFields: { file_ids: state.fileId } }));
		if (!d.id) throw new Error(`no id: ${JSON.stringify(d).slice(0, 250)}`);
		state.downloadId = d.id;
		const deadline = Date.now() + 60_000;
		let last = d;
		while (Date.now() < deadline) {
			if (last.status === 'ready') break;
			if (['failed', 'canceled', 'expired'].includes(last.status))
				throw new Error(`bulk download ${last.status}: ${JSON.stringify(last).slice(0, 200)}`);
			await sleep(3000);
			last = one(await run('bulkDownload', 'get', { downloadId: state.downloadId }));
		}
		if (last.status !== 'ready') throw new Error(`still ${last.status} after 60s`);
		const url = last.url ?? last.download_url;
		if (!url) throw new Error(`ready but no url: ${JSON.stringify(last).slice(0, 200)}`);
		return `id=${state.downloadId} status=ready url host=${new URL(url).host}`;
	});

	// 14 — members and roles
	await check('14a member.getAll', async () => {
		const rows = await run('member', 'getAll', { returnAll: false, limit: 50 });
		if (!rows.length) throw new Error('no members');
		return `${rows.length} member(s)`;
	});
	await check('14b role.getAll', async () => {
		const rows = await run('role', 'getAll', { returnAll: false, limit: 50 });
		if (!rows.length) throw new Error('no roles');
		return `${rows.length} role(s): ${rows.map((r) => r.json.name ?? r.json.id).slice(0, 6).join(', ')}`;
	});

	// 15 — trigger
	let events = [];
	await check('15a trigger loadOptions getEvents', async () => {
		const ctx = makeCtx({});
		events = await triggerNode.methods.loadOptions.getEvents.call(ctx);
		if (events[0]?.value !== '*' || events[0]?.name !== 'All Events')
			throw new Error(`first option is ${JSON.stringify(events[0])}`);
		if (events.length < 11) throw new Error(`only ${events.length - 1} events besides All Events`);
		return `${events.length - 1} events + All Events`;
	});
	await check('15b trigger webhook create', async () => {
		const eventTypes = events.filter((e) => e.value !== '*').slice(0, 3).map((e) => e.value);
		const ctx = makeCtx({ events: eventTypes.length ? eventTypes : ['file.created'] });
		try {
			await triggerNode.webhookMethods.default.create.call(ctx);
		} catch (e) {
			// A `.invalid` host may be rejected by URL validation; retry on a routable host.
			webhookUrl = `https://example.com/n8n-smoke-${randomUUID()}`;
			console.log(`  note: retrying webhook create on ${webhookUrl} after: ${describeError(e)}`);
			await triggerNode.webhookMethods.default.create.call(ctx);
		}
		if (!staticData.webhookId || !staticData.secret)
			throw new Error(`static data missing ids: ${JSON.stringify(Object.keys(staticData))}`);
		state.webhookId = staticData.webhookId;
		return `webhookId=${staticData.webhookId} secret=${staticData.secret ? 'set' : 'missing'} url=${webhookUrl}`;
	});
	await check('15c trigger checkExists → true', async () => {
		const ctx = makeCtx({});
		const exists = await triggerNode.webhookMethods.default.checkExists.call(ctx);
		if (exists !== true) throw new Error(`checkExists returned ${exists}`);
		return 'true';
	});
	await check('15d trigger delete → true, then checkExists → false', async () => {
		const ctx = makeCtx({});
		const deleted = await triggerNode.webhookMethods.default.delete.call(ctx);
		if (deleted !== true) throw new Error(`delete returned ${deleted}`);
		const exists = await triggerNode.webhookMethods.default.checkExists.call(ctx);
		if (exists !== false) throw new Error(`checkExists after delete returned ${exists}`);
		state.webhookId = null;
		return 'deleted, checkExists=false';
	});

	// 16 — cleanup
	await check('16a file.delete permanent (uploaded)', async () => {
		if (!state.fileId) throw new Error('skipped: no fileId');
		const d = one(await run('file', 'delete', { fileId: rl(state.fileId), additionalFields: { permanent: true } }));
		const id = state.fileId;
		state.fileId = null;
		return `deleted ${id}: ${JSON.stringify(d).slice(0, 100)}`;
	});
	await check('16b file.delete permanent (imported)', async () => {
		if (!state.importedFileId) throw new Error('skipped: no imported file');
		const d = one(
			await run('file', 'delete', { fileId: rl(state.importedFileId), additionalFields: { permanent: true } }),
		);
		const id = state.importedFileId;
		state.importedFileId = null;
		return `deleted ${id}: ${JSON.stringify(d).slice(0, 100)}`;
	});
	await check('16c folder.delete permanent', async () => {
		if (!state.folderId) throw new Error('skipped: no folderId');
		const d = one(
			await run('folder', 'delete', { folderId: rl(state.folderId), additionalFields: { permanent: true } }),
		);
		const id = state.folderId;
		state.folderId = null;
		return `deleted ${id}: ${JSON.stringify(d).slice(0, 100)}`;
	});

	// Best-effort sweep of anything a failed check left behind. A permanent delete only works
	// on an item that is already in the trash, so trash it first and then repeat the call.
	for (const [label, path, permanent] of [
		['board', state.boardId && `/v1/boards/${state.boardId}`, false],
		['shared link', state.sharedLinkId && `/v1/shared-links/${state.sharedLinkId}`, false],
		['page', state.pageId && `/v1/pages/${state.pageId}`, true],
		['transfer', state.transferId && `/v1/transfers/${state.transferId}`, false],
		['webhook', state.webhookId && `/v1/webhooks/${state.webhookId}`, false],
	]) {
		if (!path) continue;
		let res = await api('DELETE', path).catch((e) => ({ statusCode: 0, body: String(e) }));
		if (permanent) res = await api('DELETE', `${path}?permanent=true`).catch((e) => ({ statusCode: 0, body: String(e) }));
		const ok = res.statusCode >= 200 && res.statusCode < 300;
		console.log(`# sweep ${label}: HTTP ${res.statusCode}${ok ? '' : ' (left behind)'}`);
		if (!ok) state.leftBehind.push(`${label} ${path}`);
	}
	for (const [label, id] of [
		['file', state.fileId],
		['imported file', state.importedFileId],
		['folder', state.folderId],
	]) {
		if (id) state.leftBehind.push(`${label} ${id}`);
	}

	// Catalogue counts
	const resources = catalogue.RESOURCES;
	const counts = resources.map((r) => `${r.value}:${r.operations.length}`).join(' ');
	const total = resources.reduce((n, r) => n + r.operations.length, 0);
	console.log(`\n# catalogue: ${resources.length} resources, ${total} operations`);
	console.log(`# per resource: ${counts}`);

	const failed = results.filter((r) => !r.ok);
	console.log(`\n# ${results.length - failed.length}/${results.length} checks passed`);
	if (state.uploadProbe)
		console.log(
			`# upload session: content_type ${state.uploadProbe.hasContentType ? `present (${JSON.stringify(state.uploadProbe.contentType)})` : 'ABSENT — node falls back to the binary MIME'}`,
		);
	if (state.leftBehind.length) console.log(`# left behind: ${state.leftBehind.join(', ')}`);
	return failed.length === 0 ? 0 : 1;
}

main()
	.then((code) => process.exit(code))
	.catch((e) => {
		console.error(`FATAL ${describeError(e)}`);
		console.error(e?.stack ?? '');
		process.exit(1);
	});
