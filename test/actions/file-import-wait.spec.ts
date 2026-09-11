import type { IExecuteFunctions } from 'n8n-workflow';
import { importFromUrl, waitForImport } from '../../nodes/Brault/actions/file-import-wait';
import { file } from '../../nodes/Brault/actions/file';

jest.mock('../../nodes/Brault/transport/request', () => ({
	...jest.requireActual('../../nodes/Brault/transport/request'),
	braultRequest: jest.fn(),
}));

import { braultRequest } from '../../nodes/Brault/transport/request';

const req = braultRequest as jest.Mock;

const importSpec = file.operations.find((o) => o.operation === 'importFromUrl');
if (!importSpec) throw new Error('file.importFromUrl operation spec not found');

describe('waitForImport', () => {
	beforeEach(() => req.mockReset());

	it('polls until succeeded and returns the file', async () => {
		req
			.mockResolvedValueOnce({ id: 'imp', status: 'running' })
			.mockResolvedValueOnce({ id: 'imp', status: 'succeeded', file_id: 'f1' })
			.mockResolvedValueOnce({ id: 'f1', name: 'hero.psd' });
		await expect(waitForImport({} as never, 'imp', { intervalMs: 0, timeoutMs: 1000 })).resolves.toEqual({
			id: 'f1',
			name: 'hero.psd',
		});
		expect(req.mock.calls[2][1]).toMatchObject({ path: '/v1/files/f1' });
	});

	it('throws with the import id on failure', async () => {
		req.mockResolvedValueOnce({ id: 'imp', status: 'failed', error_code: 'source_unreachable' });
		await expect(
			waitForImport({ getNode: () => ({ name: 'Brault' }) } as never, 'imp', { intervalMs: 0, timeoutMs: 1000 }),
		).rejects.toThrow(/source_unreachable/);
	});

	it('throws on timeout', async () => {
		req.mockResolvedValue({ id: 'imp', status: 'queued' });
		await expect(
			waitForImport({ getNode: () => ({ name: 'Brault' }) } as never, 'imp', { intervalMs: 0, timeoutMs: 1 }),
		).rejects.toThrow(/imp/);
	});
});

describe('importFromUrl', () => {
	function makeCtx(additionalFields: Record<string, unknown>): IExecuteFunctions {
		return {
			getNode: () => ({ name: 'Brault' }),
			getNodeParameter: jest.fn((name: string, _i: number, def?: unknown) => {
				if (name === 'additionalFields') return additionalFields;
				if (name === 'url') return 'https://example.com/hero.psd';
				return def;
			}),
		} as unknown as IExecuteFunctions;
	}

	beforeEach(() => req.mockReset());

	it('sends only the folder when both a library and a folder are filled in', async () => {
		req.mockResolvedValueOnce({ object: 'import', id: 'imp_1', status: 'queued' });
		const ctx = makeCtx({
			library_id: { __rl: true, mode: 'list', value: 'lib_1' },
			folder_id: { __rl: true, mode: 'id', value: 'fld_1' },
		});

		const items = await importFromUrl(ctx, 0, importSpec);

		expect(req.mock.calls[0][1]).toMatchObject({ method: 'POST', path: '/v1/files/import', idempotent: true });
		expect(req.mock.calls[0][1].body).toEqual({ url: 'https://example.com/hero.psd', folder_id: 'fld_1' });
		expect(items[0].json).toMatchObject({ id: 'imp_1' });
	});
});
