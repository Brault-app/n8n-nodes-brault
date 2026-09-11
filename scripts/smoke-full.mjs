#!/usr/bin/env node
/**
 * Full-coverage headless smoke of the built Brault n8n nodes against a real Brault API.
 *
 * Every one of the catalogue's operations is exercised at least once, in dependency order,
 * over the real `dist/` code through a fake n8n execution context. The scenario is
 * self-contained: it opens a dedicated library named `n8n full smoke <timestamp>`, builds
 * everything inside it, and closes with `library.delete`, which is permanent and cascading
 * (endpoints-v1.md § libraries), so the folders, files, versions and pages go with it.
 * Objects that do not live inside a library — boards, brandspace properties, shared links,
 * transfers — are deleted by their own operations, and a final sweep verifies that nothing
 * carrying the `n8n full smoke` marker is left behind.
 *
 * Each check prints `PASS <resource>.<operation> …` or `FAIL <resource>.<operation>: …`.
 * The run keeps going after a failure; the process exits 1 when any check failed or when
 * coverage is below the catalogue's operation count.
 *
 * Usage:
 *   source ~/.config/brault/n8n-stg.env  && node scripts/smoke-full.mjs
 *   source ~/.config/brault/n8n-prod.env && node scripts/smoke-full.mjs
 * Environment:
 *   BRAULT_STG_API_KEY      API key (bsk_…) with every scope
 *   BRAULT_STG_API_BASE     central base URL, e.g. https://api.stg.brault.app
 *   BRAULT_SMOKE_ENV_FILE   env file to fall back to when the variables are unset
 */

import {
	binaryItems,
	createHarness,
	createRecorder,
	loadCredentials,
	makePng,
	one,
	rl,
	sleep,
} from './lib/smoke-context.mjs';

const { apiKey: API_KEY, baseUrl: BASE_URL, envFile } = loadCredentials();

const harness = createHarness({ apiKey: API_KEY, baseUrl: BASE_URL });
const { catalogue, run, api } = harness;

const { results, check } = createRecorder({ pauseMs: 300 });

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
/** Every object this run creates carries this marker, so the cleanup sweep can find strays. */
const MARKER = 'n8n full smoke';
const tag = (what) => `${MARKER} ${what} ${stamp}`;

const PNG_V1 = makePng(24, 0x7f);
const PNG_V2 = makePng(32, 0xd0);
const IMPORT_URL = 'https://www.w3.org/Icons/w3c_home.png';

// --------------------------------------------------------------- coverage log

/** Catalogue operations that appeared in the run, whatever their verdict. */
const covered = new Set();
const CATALOGUE_OPS = [];
for (const r of catalogue.RESOURCES) for (const o of r.operations) CATALOGUE_OPS.push(`${r.value}.${o.operation}`);
const TOTAL_OPS = CATALOGUE_OPS.length;

/**
 * Registers a catalogue operation and runs one check for it. The name is registered before
 * the body runs, so an operation still counts as covered when its check fails.
 */
async function op(resource, operation, label, fn) {
	covered.add(`${resource}.${operation}`);
	return check(`${resource}.${operation}${label ? ` ${label}` : ''}`, fn);
}

const need = (value, what) => {
	if (!value) throw new Error(`skipped: no ${what} from an earlier step`);
	return value;
};

const brief = (v, n = 150) => JSON.stringify(v ?? null).slice(0, n);

// --------------------------------------------------------------------- state

const state = {
	userId: null,
	libraryId: null,
	folderAId: null,
	folderBId: null,
	fileId: null,
	copyId: null,
	versionV1: null,
	versionV2: null,
	importId: null,
	importedFileId: null,
	commentId: null,
	replyId: null,
	propertyId: null,
	propertyOptionId: null,
	boardId: null,
	boardPropertyId: null,
	boardOptionId: null,
	boardExtraOptionId: null,
	pageId: null,
	sharedLinkId: null,
	transferId: null,
	downloadId: null,
	leftBehind: [],
};

/** Ids to re-probe at the end; each must be gone (404/410) once cleanup ran. */
const createdIds = [];
const track = (kind, path, id) => {
	if (id) createdIds.push({ kind, path, id });
};

// ----------------------------------------------------------------- scenario

async function main() {
	console.log(`# n8n-nodes-brault FULL smoke — ${new Date().toISOString()}`);
	console.log(`# central base: ${BASE_URL} (env file fallback: ${envFile})`);
	const { hosts, me } = await harness.discoverHosts();
	console.log(`# hosts: central=${hosts.central} regional=${hosts.regional}`);
	console.log(`# brandspace: ${me?.brandspace?.name ?? '?'} plan=${me?.plan?.name ?? me?.plan ?? '?'}`);
	console.log(`# marker: "${MARKER}" · stamp ${stamp}`);
	console.log(`# catalogue: ${catalogue.RESOURCES.length} resources, ${TOTAL_OPS} operations\n`);

	// ------------------------------------------------- 1 · identity and roster
	await op('brandspace', 'get', '', async () => {
		const b = one(await run('brandspace', 'get'));
		if (!b.id) throw new Error(`no id: ${brief(b)}`);
		return `${b.name ?? b.slug ?? b.id} region=${b.region ?? '?'}`;
	});
	await op('brandspace', 'getUsage', '', async () => {
		const u = one(await run('brandspace', 'getUsage'));
		const keys = Object.keys(u);
		if (!keys.length) throw new Error('empty usage body');
		return `keys: ${keys.join(', ')}`;
	});
	await op('role', 'getAll', '', async () => {
		const rows = await run('role', 'getAll', { returnAll: false, limit: 50 });
		if (!rows.length) throw new Error('no roles');
		return `${rows.length} role(s): ${rows.map((r) => r.json.name ?? r.json.id).slice(0, 6).join(', ')}`;
	});
	await op('member', 'getAll', '', async () => {
		const rows = await run('member', 'getAll', { returnAll: false, limit: 50 });
		if (!rows.length) throw new Error('no members');
		state.userId = rows[0].json.id;
		return `${rows.length} member(s), first=${state.userId}`;
	});
	await op('member', 'get', '', async () => {
		const m = one(await run('member', 'get', { userId: need(state.userId, 'userId') }));
		if (m.id !== state.userId) throw new Error(`got id ${m.id}`);
		return `id=${m.id} role=${m.role?.name ?? m.role?.id ?? '?'}`;
	});

	// -------------------------------------------------------- 2 · the library
	const libraryName = tag('library');
	await op('library', 'create', '', async () => {
		const l = one(
			await run('library', 'create', {
				name: libraryName,
				additionalFields: { description: 'Dedicated library for the full-coverage smoke', emoji: '🧪' },
			}),
		);
		if (!l.id) throw new Error(`no id: ${brief(l, 250)}`);
		state.libraryId = l.id;
		track('library', '/v1/libraries', l.id);
		return `id=${l.id} name=${l.name}`;
	});
	await op('library', 'getAll', '', async () => {
		const rows = await run('library', 'getAll', { returnAll: true });
		if (!rows.length) throw new Error('no libraries visible to the key');
		if (state.libraryId && !rows.some((r) => r.json.id === state.libraryId))
			throw new Error(`the library just created is not listed (${rows.length} rows)`);
		return `${rows.length} librar${rows.length === 1 ? 'y' : 'ies'}, created one listed`;
	});
	await op('library', 'get', '', async () => {
		const l = one(await run('library', 'get', { libraryId: rl(need(state.libraryId, 'libraryId')) }));
		if (l.id !== state.libraryId) throw new Error(`got id ${l.id}`);
		return `name=${l.name}`;
	});
	await op('library', 'update', '', async () => {
		const wanted = `${libraryName} renamed`;
		const l = one(
			await run('library', 'update', {
				libraryId: rl(need(state.libraryId, 'libraryId')),
				additionalFields: { name: wanted, description: 'renamed by the smoke' },
			}),
		);
		if (l.name !== wanted) throw new Error(`name is ${l.name}`);
		return `name=${l.name}`;
	});

	// --------------------------------------------------------- 3 · the folders
	await op('folder', 'create', '(folder A, in the library)', async () => {
		const f = one(
			await run('folder', 'create', {
				name: tag('folder A'),
				additionalFields: { library_id: rl(need(state.libraryId, 'libraryId')) },
			}),
		);
		if (!f.id) throw new Error(`no id: ${brief(f, 250)}`);
		state.folderAId = f.id;
		return `id=${f.id} name=${f.name}`;
	});
	await check('folder.create (folder B, in the library)', async () => {
		const f = one(
			await run('folder', 'create', {
				name: tag('folder B'),
				additionalFields: { library_id: rl(need(state.libraryId, 'libraryId')) },
			}),
		);
		if (!f.id) throw new Error(`no id: ${brief(f, 250)}`);
		state.folderBId = f.id;
		return `id=${f.id} name=${f.name}`;
	});
	await op('folder', 'get', '', async () => {
		const f = one(await run('folder', 'get', { folderId: rl(need(state.folderAId, 'folderAId')) }));
		if (f.id !== state.folderAId) throw new Error(`got id ${f.id}`);
		return `name=${f.name}`;
	});
	await op('folder', 'getAll', '(library filter)', async () => {
		const rows = await run('folder', 'getAll', {
			returnAll: true,
			additionalFields: { library_id: rl(need(state.libraryId, 'libraryId')), recursive: true },
		});
		const ids = rows.map((r) => r.json.id);
		for (const [label, id] of [['A', state.folderAId], ['B', state.folderBId]])
			if (id && !ids.includes(id)) throw new Error(`folder ${label} not listed (${rows.length} rows)`);
		return `${rows.length} folder(s), both listed`;
	});
	await op('folder', 'update', '(rename)', async () => {
		const wanted = `${tag('folder A')} renamed`;
		const f = one(
			await run('folder', 'update', {
				folderId: rl(need(state.folderAId, 'folderAId')),
				additionalFields: { name: wanted, color: '#FF5A1F' },
			}),
		);
		if (f.name !== wanted) throw new Error(`name is ${f.name}`);
		return `name=${f.name} color=${f.color ?? '?'}`;
	});
	await op('folder', 'move', '(B into A)', async () => {
		const f = one(
			await run('folder', 'move', {
				folderId: rl(need(state.folderBId, 'folderBId')),
				// Both destinations on purpose: normalizeDestination must keep folder_id only.
				additionalFields: { library_id: rl(state.libraryId), folder_id: rl(need(state.folderAId, 'folderAId')) },
			}),
		);
		const parent = f.folder_id ?? f.parent_id ?? f.parent?.id ?? null;
		if (parent && parent !== state.folderAId) throw new Error(`parent is ${parent}, expected ${state.folderAId}`);
		return `parent=${parent ?? '(not echoed)'}`;
	});
	await op('folder', 'delete', '(trash B)', async () => {
		const d = one(await run('folder', 'delete', { folderId: rl(need(state.folderBId, 'folderBId')), additionalFields: {} }));
		return `trashed=${brief(d, 120)}`;
	});
	await op('folder', 'restore', '(B)', async () => {
		const f = one(await run('folder', 'restore', { folderId: rl(need(state.folderBId, 'folderBId')) }));
		if (f.id !== state.folderBId) throw new Error(`got ${brief(f, 150)}`);
		return `restored id=${f.id} status=${f.status ?? f.deleted_at ?? '(live)'}`;
	});

	// ----------------------------------------------------------- 4 · the files
	await op('file', 'upload', '(24x24 PNG into folder A; library + folder both set)', async () => {
		const f = one(
			await run(
				'file',
				'upload',
				{
					binaryProperty: 'data',
					additionalFields: {
						name: `${tag('main')}.png`,
						// Both destinations on purpose: the node must collapse them to folder_id.
						...(state.libraryId ? { library_id: rl(state.libraryId) } : {}),
						...(state.folderAId ? { folder_id: rl(state.folderAId) } : {}),
					},
				},
				binaryItems(PNG_V1, 'smoke.png', 'image/png'),
			),
		);
		if (!f.id) throw new Error(`no id: ${brief(f, 300)}`);
		state.fileId = f.id;
		track('file', '/v1/files', f.id);
		return `id=${f.id} name=${f.name} status=${f.status ?? '?'} size=${f.size ?? '?'}`;
	});
	await op('file', 'get', '', async () => {
		const f = one(await run('file', 'get', { fileId: rl(need(state.fileId, 'fileId')) }));
		if (f.id !== state.fileId) throw new Error(`got id ${f.id}`);
		return `name=${f.name} mime=${f.mime ?? '?'} status=${f.status ?? '?'}`;
	});
	await op('file', 'getAll', '(folder filter + q)', async () => {
		const rows = await run('file', 'getAll', {
			returnAll: false,
			limit: 100,
			additionalFields: { folder_id: rl(need(state.folderAId, 'folderAId')), recursive: true },
		});
		const ids = rows.map((r) => r.json.id);
		if (state.fileId && !ids.includes(state.fileId)) throw new Error(`uploaded file not listed (${rows.length} rows)`);
		return `${rows.length} file(s), uploaded one listed`;
	});
	await op('file', 'update', '(tags)', async () => {
		const f = one(
			await run('file', 'update', {
				fileId: rl(need(state.fileId, 'fileId')),
				additionalFields: { tags: 'smoke,full-coverage' },
			}),
		);
		const tags = JSON.stringify(f.tags ?? null);
		if (!tags.includes('smoke')) throw new Error(`tags are ${tags}`);
		return `tags=${tags}`;
	});
	await op('file', 'move', '(A → B)', async () => {
		const f = one(
			await run('file', 'move', {
				fileId: rl(need(state.fileId, 'fileId')),
				additionalFields: { folder_id: rl(need(state.folderBId, 'folderBId')) },
			}),
		);
		const parent = f.folder_id ?? f.folder?.id ?? null;
		if (parent && parent !== state.folderBId) throw new Error(`folder is ${parent}, expected ${state.folderBId}`);
		return `folder=${parent ?? '(not echoed)'}`;
	});
	await op('file', 'copy', '(into A)', async () => {
		const f = one(
			await run('file', 'copy', {
				fileId: rl(need(state.fileId, 'fileId')),
				additionalFields: { folder_id: rl(need(state.folderAId, 'folderAId')) },
			}),
		);
		if (!f.id) throw new Error(`no id: ${brief(f, 250)}`);
		if (f.id === state.fileId) throw new Error('copy returned the source id');
		state.copyId = f.id;
		track('file', '/v1/files', f.id);
		return `copy id=${f.id} name=${f.name}`;
	});
	await op('file', 'getDownloadUrl', '', async () => {
		const l = one(await run('file', 'getDownloadUrl', { fileId: rl(need(state.fileId, 'fileId')), additionalFields: {} }));
		if (!l.url) throw new Error(`no url: ${brief(l, 200)}`);
		return `host=${new URL(l.url).host} rendition=${l.rendition ?? '?'}`;
	});
	await op('file', 'download', '(binary round trip)', async () => {
		const rows = await run('file', 'download', {
			fileId: rl(need(state.fileId, 'fileId')),
			binaryProperty: 'data',
			additionalFields: {},
		});
		const bin = rows[0]?.binary?.data;
		if (!bin) throw new Error('no binary property on the output item');
		const len = Buffer.from(bin.data, 'base64').length;
		if (len !== PNG_V1.length) throw new Error(`downloaded ${len} bytes, uploaded ${PNG_V1.length}`);
		return `${len} bytes, fileName=${bin.fileName} mime=${bin.mimeType}`;
	});
	await op('file', 'getSimilar', '', async () => {
		// A freshly uploaded synthetic PNG may have no embedding yet: an empty list is a pass,
		// only a transport or API rejection is a failure.
		const rows = await run('file', 'getSimilar', { fileId: rl(need(state.fileId, 'fileId')), returnAll: false, limit: 10 });
		return `${rows.length} similar file(s)`;
	});
	await op('file', 'delete', '(trash the copy)', async () => {
		const d = one(await run('file', 'delete', { fileId: rl(need(state.copyId, 'copyId')), additionalFields: {} }));
		return `trashed=${brief(d, 120)}`;
	});
	await op('file', 'restore', '(the copy)', async () => {
		const f = one(await run('file', 'restore', { fileId: rl(need(state.copyId, 'copyId')) }));
		if (f.id !== state.copyId) throw new Error(`got ${brief(f, 150)}`);
		return `restored id=${f.id}`;
	});

	// ------------------------------------------------------- 5 · file versions
	await check('file.upload (new version of the main file)', async () => {
		const f = one(
			await run(
				'file',
				'upload',
				{
					binaryProperty: 'data',
					// file_id alone: a version upload names no destination (endpoints-v1.md § 2.9).
					additionalFields: { file_id: need(state.fileId, 'fileId'), name: `${tag('main')}.png` },
				},
				binaryItems(PNG_V2, 'smoke-v2.png', 'image/png'),
			),
		);
		if (!f.id) throw new Error(`no id: ${brief(f, 300)}`);
		return `file=${f.id} size=${f.size ?? '?'} version=${f.version_number ?? f.version?.version_number ?? '?'}`;
	});
	await op('file', 'getVersions', '', async () => {
		const rows = await run('file', 'getVersions', { fileId: rl(need(state.fileId, 'fileId')), returnAll: true });
		if (rows.length < 2) throw new Error(`expected 2 versions after the version upload, got ${rows.length}`);
		const sorted = rows.map((r) => r.json).sort((a, b) => (a.version_number ?? 0) - (b.version_number ?? 0));
		state.versionV1 = sorted[0]?.id ?? null;
		state.versionV2 = sorted[sorted.length - 1]?.id ?? null;
		return `${rows.length} version(s): ${sorted.map((v) => `#${v.version_number}${v.is_active ? '*' : ''}`).join(' ')}`;
	});
	await op('file', 'activateVersion', '(back to v1)', async () => {
		const r = one(
			await run('file', 'activateVersion', {
				fileId: rl(need(state.fileId, 'fileId')),
				versionId: need(state.versionV1, 'versionV1'),
			}),
		);
		return brief(r, 180);
	});
	await op('file', 'deleteVersion', '(drop v2)', async () => {
		const r = one(
			await run('file', 'deleteVersion', {
				fileId: rl(need(state.fileId, 'fileId')),
				versionId: need(state.versionV2, 'versionV2'),
			}),
		);
		state.versionV2 = null;
		return brief(r, 180);
	});

	// ------------------------------------------------------ 6 · import by URL
	await op('file', 'importFromUrl', '(wait=false, returns the import)', async () => {
		const imp = one(
			await run('file', 'importFromUrl', {
				url: IMPORT_URL,
				additionalFields: {
					wait: false,
					name: `${tag('import')}.png`,
					...(state.folderAId ? { folder_id: rl(state.folderAId) } : { library_id: rl(state.libraryId) }),
				},
			}),
		);
		if (!imp.id) throw new Error(`no import id: ${brief(imp, 300)}`);
		state.importId = imp.id;
		return `import id=${imp.id} status=${imp.status ?? '?'}`;
	});
	await op('import', 'get', '(poll until it resolves)', async () => {
		const importId = need(state.importId, 'importId');
		const deadline = Date.now() + 120_000;
		let last = null;
		for (;;) {
			last = one(await run('import', 'get', { importId }));
			if (last.status === 'succeeded' || last.status === 'failed') break;
			if (Date.now() >= deadline) throw new Error(`still ${last.status} after 120s`);
			await sleep(3000);
		}
		if (last.status === 'failed') throw new Error(`import failed: error_code=${last.error_code ?? '?'}`);
		state.importedFileId = last.file_id ?? null;
		if (state.importedFileId) track('file', '/v1/files', state.importedFileId);
		return `status=${last.status} file_id=${state.importedFileId ?? '(none)'} bytes=${last.bytes_written ?? '?'}`;
	});

	// ---------------------------------------------------- 7 · comments/replies
	await op('comment', 'create', '', async () => {
		const c = one(
			await run('comment', 'create', {
				fileId: rl(need(state.fileId, 'fileId')),
				text: 'smoke comment',
				additionalFields: {},
			}),
		);
		if (!c.id) throw new Error(`no id: ${brief(c, 200)}`);
		state.commentId = c.id;
		return `id=${c.id}`;
	});
	await op('comment', 'get', '', async () => {
		const c = one(
			await run('comment', 'get', { fileId: rl(state.fileId), commentId: need(state.commentId, 'commentId') }),
		);
		if (c.id !== state.commentId) throw new Error(`got id ${c.id}`);
		return `text=${JSON.stringify(c.text ?? c.body ?? null)}`;
	});
	await op('comment', 'getAll', '', async () => {
		const rows = await run('comment', 'getAll', {
			fileId: rl(need(state.fileId, 'fileId')),
			returnAll: false,
			limit: 50,
			additionalFields: {},
		});
		if (state.commentId && !rows.some((r) => r.json.id === state.commentId))
			throw new Error(`created comment not listed (${rows.length} rows)`);
		return `${rows.length} comment(s)`;
	});
	await op('comment', 'update', '(edit the text)', async () => {
		const c = one(
			await run('comment', 'update', {
				fileId: rl(state.fileId),
				commentId: need(state.commentId, 'commentId'),
				text: 'smoke comment edited',
			}),
		);
		const text = String(c.text ?? c.body ?? '');
		if (!text.includes('edited')) throw new Error(`text is ${JSON.stringify(text)}`);
		return `text=${JSON.stringify(text)}`;
	});
	await op('reply', 'create', '', async () => {
		const r = one(
			await run('reply', 'create', {
				fileId: rl(state.fileId),
				commentId: need(state.commentId, 'commentId'),
				text: 'smoke reply',
			}),
		);
		if (!r.id) throw new Error(`no id: ${brief(r, 200)}`);
		state.replyId = r.id;
		return `id=${r.id}`;
	});
	await op('reply', 'getAll', '', async () => {
		const rows = await run('reply', 'getAll', {
			fileId: rl(state.fileId),
			commentId: need(state.commentId, 'commentId'),
			returnAll: false,
			limit: 50,
		});
		if (state.replyId && !rows.some((r) => r.json.id === state.replyId))
			throw new Error(`created reply not listed (${rows.length} rows)`);
		return `${rows.length} repl${rows.length === 1 ? 'y' : 'ies'}`;
	});
	await op('reply', 'update', '', async () => {
		const r = one(
			await run('reply', 'update', {
				fileId: rl(state.fileId),
				commentId: need(state.commentId, 'commentId'),
				replyId: need(state.replyId, 'replyId'),
				text: 'smoke reply edited',
			}),
		);
		const text = String(r.text ?? r.body ?? '');
		if (!text.includes('edited')) throw new Error(`text is ${JSON.stringify(text)}`);
		return `text=${JSON.stringify(text)}`;
	});
	await op('reply', 'delete', '', async () => {
		const d = one(
			await run('reply', 'delete', {
				fileId: rl(state.fileId),
				commentId: need(state.commentId, 'commentId'),
				replyId: need(state.replyId, 'replyId'),
			}),
		);
		state.replyId = null;
		return brief(d, 120);
	});
	await op('comment', 'resolve', '', async () => {
		const c = one(
			await run('comment', 'resolve', { fileId: rl(state.fileId), commentId: need(state.commentId, 'commentId') }),
		);
		return `resolved=${brief(c.resolved ?? c.completed ?? c.resolved_at ?? null, 60)}`;
	});
	await op('comment', 'reopen', '', async () => {
		const c = one(
			await run('comment', 'reopen', { fileId: rl(state.fileId), commentId: need(state.commentId, 'commentId') }),
		);
		return `resolved=${brief(c.resolved ?? c.resolved_at ?? null, 60)}`;
	});
	await op('comment', 'delete', '', async () => {
		const d = one(
			await run('comment', 'delete', { fileId: rl(state.fileId), commentId: need(state.commentId, 'commentId') }),
		);
		state.commentId = null;
		return brief(d, 120);
	});

	// ------------------------------------------- 8 · brandspace properties
	await op('property', 'create', '(tag)', async () => {
		const p = one(
			await run('property', 'create', {
				name: tag('property'),
				type: 'tag',
				additionalFields: { selection_mode: 'multiple' },
			}),
		);
		if (!p.id) throw new Error(`no id: ${brief(p, 250)}`);
		state.propertyId = p.id;
		track('property', '/v1/properties', p.id);
		return `id=${p.id} type=${p.type ?? '?'}`;
	});
	await op('property', 'get', '', async () => {
		const p = one(await run('property', 'get', { propertyId: rl(need(state.propertyId, 'propertyId')) }));
		if (p.id !== state.propertyId) throw new Error(`got id ${p.id}`);
		return `name=${p.name} options=${(p.options ?? p.select_options ?? []).length}`;
	});
	await op('property', 'getAll', '', async () => {
		const rows = await run('property', 'getAll', { returnAll: true });
		if (state.propertyId && !rows.some((r) => r.json.id === state.propertyId))
			throw new Error(`created property not listed (${rows.length} rows)`);
		return `${rows.length} propert${rows.length === 1 ? 'y' : 'ies'}, created one listed`;
	});
	await op('property', 'update', '(rename)', async () => {
		const wanted = `${tag('property')} renamed`;
		const p = one(
			await run('property', 'update', {
				propertyId: rl(need(state.propertyId, 'propertyId')),
				additionalFields: { name: wanted },
			}),
		);
		if (p.name !== wanted) throw new Error(`name is ${p.name}`);
		return `name=${p.name}`;
	});
	await op('property', 'addOption', '', async () => {
		const o = one(
			await run('property', 'addOption', {
				propertyId: rl(need(state.propertyId, 'propertyId')),
				label: 'Smoke option',
				additionalFields: { color: '#3B82F6' },
			}),
		);
		const id = o.id ?? (o.options ?? []).slice(-1)[0]?.id;
		if (!id) throw new Error(`no option id: ${brief(o, 250)}`);
		state.propertyOptionId = id;
		return `option=${id}`;
	});
	await op('property', 'updateOption', '', async () => {
		const o = one(
			await run('property', 'updateOption', {
				propertyId: rl(need(state.propertyId, 'propertyId')),
				optionId: need(state.propertyOptionId, 'propertyOptionId'),
				additionalFields: { label: 'Smoke option renamed', color: '#22C55E' },
			}),
		);
		return brief(o, 180);
	});
	await op('file', 'setProperty', '(tags: add the option)', async () => {
		const r = one(
			await run('file', 'setProperty', {
				fileId: rl(need(state.fileId, 'fileId')),
				propertyId: rl(need(state.propertyId, 'propertyId')),
				valueType: 'tags',
				add: need(state.propertyOptionId, 'propertyOptionId'),
				remove: '',
			}),
		);
		return brief(r, 180);
	});
	await op('property', 'deleteOption', '', async () => {
		const d = one(
			await run('property', 'deleteOption', {
				propertyId: rl(need(state.propertyId, 'propertyId')),
				optionId: need(state.propertyOptionId, 'propertyOptionId'),
			}),
		);
		state.propertyOptionId = null;
		return brief(d, 120);
	});
	await op('property', 'delete', '', async () => {
		const d = one(await run('property', 'delete', { propertyId: rl(need(state.propertyId, 'propertyId')) }));
		const id = state.propertyId;
		state.propertyId = null;
		return `deleted ${id}: ${brief(d, 120)}`;
	});

	// --------------------------------------------------------- 9 · the board
	await op('board', 'create', '', async () => {
		const b = one(
			await run('board', 'create', { name: tag('board'), additionalFields: { default_property_type: 'status' } }),
		);
		if (!b.id) throw new Error(`no id: ${brief(b, 250)}`);
		state.boardId = b.id;
		track('board', '/v1/boards', b.id);
		return `id=${b.id} name=${b.name}`;
	});
	await op('board', 'get', '', async () => {
		const b = one(await run('board', 'get', { boardId: rl(need(state.boardId, 'boardId')) }));
		if (b.id !== state.boardId) throw new Error(`got id ${b.id}`);
		return `name=${b.name}`;
	});
	await op('board', 'getAll', '', async () => {
		const rows = await run('board', 'getAll', { returnAll: true });
		if (state.boardId && !rows.some((r) => r.json.id === state.boardId))
			throw new Error(`created board not listed (${rows.length} rows)`);
		return `${rows.length} board(s), created one listed`;
	});
	await op('board', 'update', '(rename + pin)', async () => {
		const wanted = `${tag('board')} renamed`;
		const b = one(
			await run('board', 'update', {
				boardId: rl(need(state.boardId, 'boardId')),
				additionalFields: { name: wanted, emoji: '🧪', pinned: true },
			}),
		);
		if (b.name !== wanted) throw new Error(`name is ${b.name}`);
		return `name=${b.name} pinned=${b.pinned ?? '?'}`;
	});
	await op('board', 'addFiles', '', async () => {
		const r = one(
			await run('board', 'addFiles', {
				boardId: rl(need(state.boardId, 'boardId')),
				file_ids: need(state.fileId, 'fileId'),
			}),
		);
		return brief(r, 160);
	});
	await op('board', 'query', '', async () => {
		const rows = await run('board', 'query', {
			boardId: rl(need(state.boardId, 'boardId')),
			returnAll: false,
			limit: 50,
			additionalFields: { sort: 'added_at', order: 'desc' },
		});
		// Rows are `board_file` objects: the file lives under `file` (boards.md § 3.4).
		if (state.fileId && !rows.some((r) => r.json.file?.id === state.fileId || r.json.id === state.fileId))
			throw new Error(`added file not in the board query (${rows.length} rows)`);
		return `${rows.length} row(s)`;
	});
	await op('board', 'getMembers', '', async () => {
		const rows = await run('board', 'getMembers', { boardId: rl(need(state.boardId, 'boardId')) });
		return `${rows.length} member row(s)`;
	});
	await op('file', 'getBoards', '', async () => {
		const rows = await run('file', 'getBoards', { fileId: rl(need(state.fileId, 'fileId')) });
		if (state.boardId && !rows.some((r) => r.json.id === state.boardId || r.json.board?.id === state.boardId))
			throw new Error(`the board holding the file is not listed (${rows.length} rows): ${brief(rows.map((r) => r.json), 200)}`);
		return `${rows.length} board(s), the created one listed`;
	});
	await op('boardProperty', 'create', '(status with two options)', async () => {
		const p = one(
			await run('boardProperty', 'create', {
				boardId: rl(need(state.boardId, 'boardId')),
				name: 'Smoke status',
				type: 'status',
				additionalFields: { options: JSON.stringify([{ label: 'Todo' }, { label: 'Done' }]) },
			}),
		);
		if (!p.id) throw new Error(`no id: ${brief(p, 250)}`);
		state.boardPropertyId = p.id;
		const options = p.options ?? p.select_options ?? [];
		state.boardOptionId = options[0]?.id ?? null;
		if (!state.boardOptionId) throw new Error(`no option ids returned: ${brief(p, 250)}`);
		return `property=${p.id} options=${options.map((o) => `${o.label}:${o.id}`).join(', ')}`;
	});
	await op('boardProperty', 'get', '', async () => {
		const p = one(
			await run('boardProperty', 'get', {
				boardId: rl(state.boardId),
				propertyId: need(state.boardPropertyId, 'boardPropertyId'),
			}),
		);
		if (p.id !== state.boardPropertyId) throw new Error(`got id ${p.id}`);
		return `name=${p.name} type=${p.type ?? '?'}`;
	});
	await op('boardProperty', 'getAll', '', async () => {
		const rows = await run('boardProperty', 'getAll', {
			boardId: rl(need(state.boardId, 'boardId')),
			returnAll: true,
		});
		if (state.boardPropertyId && !rows.some((r) => r.json.id === state.boardPropertyId))
			throw new Error(`created board property not listed (${rows.length} rows)`);
		return `${rows.length} propert${rows.length === 1 ? 'y' : 'ies'}, created one listed`;
	});
	await op('boardProperty', 'update', '(rename)', async () => {
		const p = one(
			await run('boardProperty', 'update', {
				boardId: rl(state.boardId),
				propertyId: need(state.boardPropertyId, 'boardPropertyId'),
				name: 'Smoke status renamed',
			}),
		);
		if (p.name !== 'Smoke status renamed') throw new Error(`name is ${p.name}`);
		return `name=${p.name}`;
	});
	await op('boardProperty', 'addOption', '', async () => {
		const o = one(
			await run('boardProperty', 'addOption', {
				boardId: rl(state.boardId),
				propertyId: need(state.boardPropertyId, 'boardPropertyId'),
				label: 'Blocked',
				additionalFields: { color: '#EF4444' },
			}),
		);
		const id = o.id ?? (o.options ?? []).slice(-1)[0]?.id;
		if (!id) throw new Error(`no option id: ${brief(o, 250)}`);
		state.boardExtraOptionId = id;
		return `option=${id}`;
	});
	await op('boardProperty', 'updateOption', '', async () => {
		const o = one(
			await run('boardProperty', 'updateOption', {
				boardId: rl(state.boardId),
				propertyId: need(state.boardPropertyId, 'boardPropertyId'),
				optionId: need(state.boardExtraOptionId, 'boardExtraOptionId'),
				additionalFields: { label: 'Blocked renamed', color: '#F97316', hidden: false },
			}),
		);
		return brief(o, 180);
	});
	await op('board', 'setFileProperty', '(status)', async () => {
		const r = one(
			await run('board', 'setFileProperty', {
				boardId: rl(need(state.boardId, 'boardId')),
				fileId: rl(need(state.fileId, 'fileId')),
				propertyId: need(state.boardPropertyId, 'boardPropertyId'),
				valueType: 'status',
				option_id: need(state.boardOptionId, 'boardOptionId'),
			}),
		);
		return brief(r, 160);
	});
	await op('boardProperty', 'deleteOption', '', async () => {
		const d = one(
			await run('boardProperty', 'deleteOption', {
				boardId: rl(state.boardId),
				propertyId: need(state.boardPropertyId, 'boardPropertyId'),
				optionId: need(state.boardExtraOptionId, 'boardExtraOptionId'),
			}),
		);
		state.boardExtraOptionId = null;
		return brief(d, 120);
	});
	await op('boardProperty', 'delete', '', async () => {
		const d = one(
			await run('boardProperty', 'delete', {
				boardId: rl(state.boardId),
				propertyId: need(state.boardPropertyId, 'boardPropertyId'),
			}),
		);
		state.boardPropertyId = null;
		state.boardOptionId = null;
		return brief(d, 120);
	});
	await op('board', 'removeFile', '', async () => {
		const d = one(
			await run('board', 'removeFile', {
				boardId: rl(need(state.boardId, 'boardId')),
				fileId: rl(need(state.fileId, 'fileId')),
			}),
		);
		return brief(d, 120);
	});
	await op('board', 'delete', '', async () => {
		const d = one(await run('board', 'delete', { boardId: rl(need(state.boardId, 'boardId')) }));
		const id = state.boardId;
		state.boardId = null;
		return `deleted ${id}: ${brief(d, 120)}`;
	});

	// ---------------------------------------------------------- 10 · the page
	await op('page', 'create', '(in folder A)', async () => {
		const p = one(
			await run('page', 'create', {
				name: tag('page'),
				additionalFields: {
					...(state.folderAId ? { folder_id: rl(state.folderAId) } : { library_id: rl(state.libraryId) }),
					blocks: JSON.stringify([
						{ type: 'heading', level: 1, text: 'Smoke page' },
						{ type: 'paragraph', text: 'Created by the full-coverage smoke.' },
					]),
				},
			}),
		);
		if (!p.id) throw new Error(`no id: ${brief(p, 250)}`);
		state.pageId = p.id;
		track('page', '/v1/pages', p.id);
		return `id=${p.id} name=${p.name}`;
	});
	await op('page', 'get', '(markdown)', async () => {
		const p = one(
			await run('page', 'get', { pageId: rl(need(state.pageId, 'pageId')), additionalFields: { format: 'markdown' } }),
		);
		if (p.id !== state.pageId) throw new Error(`got id ${p.id}`);
		return `name=${p.name} keys=${Object.keys(p).slice(0, 8).join(',')}`;
	});
	await op('page', 'getAll', '(folder filter)', async () => {
		const rows = await run('page', 'getAll', {
			returnAll: true,
			additionalFields: { library_id: rl(need(state.libraryId, 'libraryId')), recursive: true },
		});
		if (state.pageId && !rows.some((r) => r.json.id === state.pageId))
			throw new Error(`created page not listed (${rows.length} rows)`);
		return `${rows.length} page(s), created one listed`;
	});
	await op('page', 'appendBlocks', '', async () => {
		const p = one(
			await run('page', 'appendBlocks', {
				pageId: rl(need(state.pageId, 'pageId')),
				blocks: JSON.stringify([
					{ type: 'heading', level: 2, text: 'Appended section' },
					{ type: 'bullet_list', items: ['one', 'two'] },
					{ type: 'code_block', language: 'json', text: '{"smoke":true}' },
					{ type: 'divider' },
				]),
			}),
		);
		if (p.id !== state.pageId) throw new Error(`got ${brief(p, 200)}`);
		const blocks = Array.isArray(p.blocks) ? p.blocks.length : '?';
		return `blocks now=${blocks}`;
	});
	await op('page', 'publish', '', async () => {
		const p = one(await run('page', 'publish', { pageId: rl(need(state.pageId, 'pageId')) }));
		return `published_at=${p.published_at ?? '?'} public_url=${p.public_url ?? '(none)'}`;
	});
	await op('page', 'unpublish', '', async () => {
		const p = one(await run('page', 'unpublish', { pageId: rl(need(state.pageId, 'pageId')) }));
		if (p.published_at) throw new Error(`still published_at=${p.published_at}`);
		return `published_at=${p.published_at ?? 'null'}`;
	});
	await op('page', 'delete', '(permanent)', async () => {
		const d = one(
			await run('page', 'delete', { pageId: rl(need(state.pageId, 'pageId')), additionalFields: { permanent: true } }),
		);
		const id = state.pageId;
		state.pageId = null;
		return `deleted ${id}: ${brief(d, 120)}`;
	});

	// --------------------------------------------------- 11 · the shared link
	await op('sharedLink', 'create', '(folder target, so the listing shows it)', async () => {
		const l = one(
			await run('sharedLink', 'create', {
				targetType: 'folder',
				targetId: need(state.folderAId, 'folderAId'),
				additionalFields: { access: 'review', anonymous_comments: true },
			}),
		);
		if (!l.id) throw new Error(`no id: ${brief(l, 250)}`);
		if (!l.url) throw new Error(`no url: ${brief(l, 250)}`);
		state.sharedLinkId = l.id;
		track('shared link', '/v1/shared-links', l.id);
		return `id=${l.id} url=${l.url} access=${l.access ?? '?'}`;
	});
	await op('sharedLink', 'get', '', async () => {
		const l = one(await run('sharedLink', 'get', { sharedLinkId: need(state.sharedLinkId, 'sharedLinkId') }));
		if (l.id !== state.sharedLinkId) throw new Error(`got id ${l.id}`);
		return `access=${l.access ?? '?'} anonymous_comments=${l.anonymous_comments ?? '?'}`;
	});
	await op('sharedLink', 'getAll', '', async () => {
		const rows = await run('sharedLink', 'getAll', { returnAll: true });
		// File-scoped links are excluded from this listing by contract; a folder link is not.
		if (state.sharedLinkId && !rows.some((r) => r.json.id === state.sharedLinkId))
			throw new Error(`the folder-scoped link created is not listed (${rows.length} rows)`);
		return `${rows.length} link(s), created one listed`;
	});
	await op('sharedLink', 'update', '(access + expiry + comments)', async () => {
		const expires = new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString();
		const l = one(
			await run('sharedLink', 'update', {
				sharedLinkId: need(state.sharedLinkId, 'sharedLinkId'),
				additionalFields: { access: 'download', expires_at: expires, anonymous_comments: false },
			}),
		);
		if (l.access !== 'download') throw new Error(`access is ${l.access}`);
		return `access=${l.access} expires_at=${l.expires_at ?? '?'}`;
	});
	await op('sharedLink', 'delete', '', async () => {
		const d = one(await run('sharedLink', 'delete', { sharedLinkId: need(state.sharedLinkId, 'sharedLinkId') }));
		const id = state.sharedLinkId;
		state.sharedLinkId = null;
		return `deleted ${id}: ${brief(d, 120)}`;
	});

	// ----------------------------------------------------- 12 · the transfer
	await op('transfer', 'create', '(binary + existing file)', async () => {
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
				binaryItems(PNG_V1, `${tag('transfer')}.png`, 'image/png'),
			),
		);
		if (!t.id) throw new Error(`no id: ${brief(t, 250)}`);
		const url = t.url ?? t.download_url ?? t.share_url;
		if (!url) throw new Error(`no url: ${brief(t, 250)}`);
		state.transferId = t.id;
		track('transfer', '/v1/transfers', t.id);
		return `id=${t.id} url=${url} status=${t.status ?? '?'}`;
	});
	await op('transfer', 'get', '', async () => {
		const t = one(await run('transfer', 'get', { transferId: need(state.transferId, 'transferId') }));
		if (t.id !== state.transferId) throw new Error(`got id ${t.id}`);
		return `status=${t.status ?? '?'} files=${Array.isArray(t.files) ? t.files.length : '?'}`;
	});
	await op('transfer', 'getAll', '', async () => {
		const rows = await run('transfer', 'getAll', { returnAll: true });
		if (state.transferId && !rows.some((r) => r.json.id === state.transferId))
			throw new Error(`created transfer not listed (${rows.length} rows)`);
		return `${rows.length} transfer(s), created one listed`;
	});
	await op('transfer', 'update', '(expiry only: a password needs the plan feature)', async () => {
		const t = one(
			await run('transfer', 'update', {
				transferId: need(state.transferId, 'transferId'),
				additionalFields: { expires_in_days: 2 },
			}),
		);
		if (t.id !== state.transferId) throw new Error(`got ${brief(t, 200)}`);
		return `expires_at=${t.expires_at ?? '?'}`;
	});
	await op('transfer', 'delete', '', async () => {
		const d = one(await run('transfer', 'delete', { transferId: need(state.transferId, 'transferId') }));
		const id = state.transferId;
		state.transferId = null;
		return `deleted ${id}: ${brief(d, 120)}`;
	});

	// ------------------------------------------------- 13 · bulk download/search
	await op('bulkDownload', 'create', '', async () => {
		const d = one(
			await run('bulkDownload', 'create', {
				additionalFields: { file_ids: need(state.fileId, 'fileId'), renditions: [] },
			}),
		);
		if (!d.id) throw new Error(`no id: ${brief(d, 250)}`);
		state.downloadId = d.id;
		return `id=${d.id} status=${d.status ?? '?'}`;
	});
	await op('bulkDownload', 'get', '(poll until ready)', async () => {
		const downloadId = need(state.downloadId, 'downloadId');
		const deadline = Date.now() + 90_000;
		let last = one(await run('bulkDownload', 'get', { downloadId }));
		while (Date.now() < deadline && last.status !== 'ready') {
			if (['failed', 'canceled', 'expired'].includes(last.status))
				throw new Error(`bulk download ${last.status}: ${brief(last, 200)}`);
			await sleep(3000);
			last = one(await run('bulkDownload', 'get', { downloadId }));
		}
		if (last.status !== 'ready') throw new Error(`still ${last.status} after 90s`);
		const url = last.url ?? last.download_url;
		if (!url) throw new Error(`ready but no url: ${brief(last, 200)}`);
		return `status=ready url host=${new URL(url).host}`;
	});
	await op('search', 'search', '(scoped to the smoke library)', async () => {
		const rows = await run('search', 'search', {
			q: 'smoke',
			returnAll: false,
			limit: 10,
			additionalFields: state.libraryId ? { scope: `library:${state.libraryId}` } : {},
		});
		return `${rows.length} hit(s)`;
	});

	// --------------------------------------------------------- 14 · teardown
	// DELETE /v1/libraries/:id is permanent and cascading (endpoints-v1.md § libraries):
	// the folders, files, versions and pages created above go with it.
	await op('library', 'delete', '(cascades over the whole scenario)', async () => {
		const id = need(state.libraryId, 'libraryId');
		const d = one(await run('library', 'delete', { libraryId: rl(id) }));
		state.libraryId = null;
		state.folderAId = null;
		state.folderBId = null;
		state.fileId = null;
		state.copyId = null;
		state.importedFileId = null;
		return `deleted ${id}: ${brief(d, 120)}`;
	});
}

// ------------------------------------------------------------------- cleanup

/** Deletes anything a failed check left behind, so a bad run does not poison the next one. */
async function sweep() {
	const strays = [
		['shared link', state.sharedLinkId && `/v1/shared-links/${state.sharedLinkId}`, false],
		['transfer', state.transferId && `/v1/transfers/${state.transferId}`, false],
		['board property', state.boardId && state.boardPropertyId && `/v1/boards/${state.boardId}/properties/${state.boardPropertyId}`, false],
		['board', state.boardId && `/v1/boards/${state.boardId}`, false],
		['property', state.propertyId && `/v1/properties/${state.propertyId}`, false],
		['page', state.pageId && `/v1/pages/${state.pageId}`, true],
		['library', state.libraryId && `/v1/libraries/${state.libraryId}`, false],
	];
	for (const [label, path, permanent] of strays) {
		if (!path) continue;
		let res = await api('DELETE', path).catch((e) => ({ statusCode: 0, body: String(e) }));
		if (permanent)
			res = await api('DELETE', `${path}?permanent=true`).catch((e) => ({ statusCode: 0, body: String(e) }));
		const ok = res.statusCode >= 200 && res.statusCode < 300;
		console.log(`# sweep ${label} ${path}: HTTP ${res.statusCode}${ok ? '' : ' (LEFT BEHIND)'}`);
		if (!ok) state.leftBehind.push(`${label} ${path} (HTTP ${res.statusCode})`);
	}
}

/**
 * Two-sided verification: every id this run created must be gone, and no listing may still
 * carry the `n8n full smoke` marker.
 */
async function verifyClean() {
	console.log('\n# --- cleanup verification ---');
	// `DELETE /v1/transfers/:id` expires a completed transfer instead of removing the row
	// (transfers.md §111: `handleMarkTransferAsExpired`), so `expired` is a torn-down transfer.
	const TERMINAL_STATUS = new Set(['expired', 'deleted', 'canceled', 'cancelled', 'revoked']);
	for (const { kind, path, id } of createdIds) {
		const res = await api('GET', `${path}/${encodeURIComponent(id)}`);
		const row = res.body?.data ?? res.body ?? {};
		const gone = res.statusCode === 404 || res.statusCode === 410;
		const trashed = res.statusCode === 200 && Boolean(row.deleted_at);
		const terminal = res.statusCode === 200 && TERMINAL_STATUS.has(String(row.status ?? ''));
		if (gone) console.log(`# gone ${kind} ${id} (HTTP ${res.statusCode})`);
		else if (trashed) console.log(`# trashed ${kind} ${id} (HTTP 200, deleted_at set)`);
		else if (terminal) console.log(`# ${row.status} ${kind} ${id} (HTTP 200, terminal status — the API keeps the row)`);
		else {
			console.log(`# STILL PRESENT ${kind} ${id} (HTTP ${res.statusCode} status=${row.status ?? '?'})`);
			state.leftBehind.push(`${kind} ${id} still reachable at ${path}/${id}`);
		}
		await sleep(120);
	}

	const listings = [
		['libraries', '/v1/libraries'],
		['folders', '/v1/folders'],
		['files', '/v1/files'],
		['pages', '/v1/pages'],
		['boards', '/v1/boards'],
		['properties', '/v1/properties'],
		['shared links', '/v1/shared-links'],
		['transfers', '/v1/transfers'],
		['webhooks', '/v1/webhooks'],
	];
	for (const [label, path] of listings) {
		const res = await api('GET', path, { qs: { limit: 100 } });
		if (res.statusCode < 200 || res.statusCode >= 300) {
			console.log(`# listing ${label}: HTTP ${res.statusCode} (could not verify)`);
			await sleep(120);
			continue;
		}
		const rows = res.body?.data ?? res.body ?? [];
		const strays = (Array.isArray(rows) ? rows : []).filter((row) => JSON.stringify(row).includes(MARKER));
		if (strays.length) {
			console.log(`# STRAYS in ${label}: ${strays.map((r) => `${r.id}:${r.name ?? '(unnamed)'}`).join(', ')}`);
			for (const r of strays) state.leftBehind.push(`${label} ${r.id} (${r.name ?? 'unnamed'})`);
		} else {
			console.log(`# clean ${label}: no "${MARKER}" row among ${Array.isArray(rows) ? rows.length : 0}`);
		}
		await sleep(120);
	}
}

// ---------------------------------------------------------------------- run

let exitCode = 0;
try {
	await main();
} catch (e) {
	console.log(`FAIL scenario aborted: ${e?.message ?? e}`);
	results.push({ name: 'scenario', ok: false, detail: String(e?.message ?? e) });
}

try {
	await sweep();
	await verifyClean();
} catch (e) {
	console.log(`# cleanup verification errored: ${e?.message ?? e}`);
	state.leftBehind.push(`verification errored: ${e?.message ?? e}`);
}

const failed = results.filter((r) => !r.ok);
const missing = CATALOGUE_OPS.filter((name) => !covered.has(name));

console.log(`\n# ${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
	console.log('# failures:');
	for (const f of failed) console.log(`#   ${f.name}: ${f.detail}`);
}
if (missing.length) console.log(`# operations never exercised: ${missing.join(', ')}`);
if (state.leftBehind.length) console.log(`# LEFT BEHIND: ${state.leftBehind.join(' | ')}`);
else console.log('# left behind: nothing');
console.log(`COVERAGE ${covered.size}/${TOTAL_OPS}`);

if (failed.length || covered.size < TOTAL_OPS) exitCode = 1;
process.exit(exitCode);
