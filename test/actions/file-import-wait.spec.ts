import { waitForImport } from '../../nodes/Brault/actions/file-import-wait';

jest.mock('../../nodes/Brault/transport/request', () => ({ braultRequest: jest.fn() }));

import { braultRequest } from '../../nodes/Brault/transport/request';

const req = braultRequest as jest.Mock;

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
