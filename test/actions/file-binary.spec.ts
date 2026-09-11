import type { IExecuteFunctions } from 'n8n-workflow';
import { file } from '../../nodes/Brault/actions/file';

jest.mock('../../nodes/Brault/transport/request', () => ({
	...jest.requireActual('../../nodes/Brault/transport/request'),
	braultRequest: jest.fn(),
}));
jest.mock('../../nodes/Brault/transport/binary', () => ({
	readBinarySource: jest.fn(),
	uploadWithSession: jest.fn(),
	downloadToBinary: jest.fn(),
}));

import { uploadFile } from '../../nodes/Brault/actions/file-binary';
import { braultRequest } from '../../nodes/Brault/transport/request';
import { readBinarySource, uploadWithSession } from '../../nodes/Brault/transport/binary';

const req = braultRequest as jest.Mock;
const readBinary = readBinarySource as jest.Mock;
const uploadSession = uploadWithSession as jest.Mock;

const uploadSpec = file.operations.find((o) => o.operation === 'upload');
if (!uploadSpec) throw new Error('file.upload operation spec not found');

function makeCtx(additionalFields: Record<string, unknown>): IExecuteFunctions {
	return {
		getNode: () => ({ name: 'Brault' }),
		getNodeParameter: jest.fn((name: string, _i: number, def?: unknown) => {
			if (name === 'additionalFields') return additionalFields;
			if (name === 'binaryProperty') return 'data';
			return def;
		}),
	} as unknown as IExecuteFunctions;
}

describe('uploadFile', () => {
	beforeEach(() => {
		req.mockReset();
		readBinary.mockReset();
		uploadSession.mockReset();
		readBinary.mockResolvedValue({
			source: Buffer.from('abc'),
			size: 3,
			fileName: 'a.png',
			mimeType: 'image/png',
		});
		uploadSession.mockResolvedValue({ id: 'f1' });
	});

	it('coerces resource-locator fields from Additional Fields into plain IDs in the upload body', async () => {
		req.mockResolvedValueOnce({ id: 'up_1', method: 'put', upload_url: 'https://s3/put' });
		const ctx = makeCtx({ library_id: { __rl: true, mode: 'list', value: 'lib_1' } });

		await uploadFile(ctx, 0, uploadSpec);

		expect(req.mock.calls[0][1]).toMatchObject({ method: 'POST', path: '/v1/uploads' });
		expect(req.mock.calls[0][1].body).toEqual({ name: 'a.png', size: 3, library_id: 'lib_1' });
	});

	it('sends only the folder when both a library and a folder are filled in', async () => {
		req.mockResolvedValueOnce({ id: 'up_1', method: 'put', upload_url: 'https://s3/put' });
		const ctx = makeCtx({
			library_id: { __rl: true, mode: 'list', value: 'lib_1' },
			folder_id: { __rl: true, mode: 'id', value: 'fld_1' },
		});

		await uploadFile(ctx, 0, uploadSpec);

		expect(req.mock.calls[0][1].body).toEqual({ name: 'a.png', size: 3, folder_id: 'fld_1' });
	});

	it('omits an added-but-blank locator instead of sending an empty string', async () => {
		req.mockResolvedValueOnce({ id: 'up_1', method: 'put', upload_url: 'https://s3/put' });
		const ctx = makeCtx({
			library_id: { __rl: true, mode: 'list', value: '' },
		});

		await uploadFile(ctx, 0, uploadSpec);

		expect(req.mock.calls[0][1].body).toEqual({ name: 'a.png', size: 3 });
	});

	it('lets an explicit name in Additional Fields override the binary file name', async () => {
		req.mockResolvedValueOnce({ id: 'up_1', method: 'put', upload_url: 'https://s3/put' });
		const ctx = makeCtx({ name: 'custom.png' });

		await uploadFile(ctx, 0, uploadSpec);

		expect(req.mock.calls[0][1].body).toMatchObject({ name: 'custom.png' });
	});

	it('passes size/mimeType meta and the abort route to uploadWithSession', async () => {
		const session = { id: 'up_1', method: 'put', upload_url: 'https://s3/put' };
		req.mockResolvedValueOnce(session);
		const ctx = makeCtx({});

		await uploadFile(ctx, 0, uploadSpec);

		expect(uploadSession).toHaveBeenCalledWith(
			ctx,
			session,
			Buffer.from('abc'),
			{
				parts: '/v1/uploads/up_1/parts',
				complete: '/v1/uploads/up_1/complete',
				abort: '/v1/uploads/up_1/abort',
			},
			{ size: 3, mimeType: 'image/png' },
		);
	});
});
