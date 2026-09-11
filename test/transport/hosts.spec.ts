import { clearHostsCache, resolveHosts } from '../../nodes/Brault/transport/hosts';

function ctx(body: unknown, opts: { fail?: boolean } = {}) {
	const httpRequestWithAuthentication = jest.fn(async () => {
		if (opts.fail) throw new Error('boom');
		return { statusCode: 200, body };
	});
	return {
		calls: httpRequestWithAuthentication,
		getCredentials: jest.fn(async () => ({ apiKey: 'bsk_us_abcdefgh_rest', baseUrl: 'https://api.stg.brault.app/' })),
		helpers: { httpRequestWithAuthentication },
	} as never;
}

describe('resolveHosts', () => {
	beforeEach(() => clearHostsCache());

	it('reads hosts from the flat GET /v1/me body and strips the trailing slash from baseUrl', async () => {
		const c = ctx({
			object: 'me',
			brandspace: { id: 'bs_1' },
			hosts: { central: 'https://api.stg.brault.app', regional: 'https://us.api.stg.brault.app' },
		});
		await expect(resolveHosts(c)).resolves.toEqual({ central: 'https://api.stg.brault.app', regional: 'https://us.api.stg.brault.app' });
		expect((c as never as { calls: jest.Mock }).calls.mock.calls[0][1]).toMatchObject({ method: 'GET', url: 'https://api.stg.brault.app/v1/me' });
	});

	it('caches per credential for ten minutes', async () => {
		const c = ctx({ object: 'me', hosts: { central: 'https://a', regional: 'https://b' } });
		await resolveHosts(c);
		await resolveHosts(c);
		expect((c as never as { calls: jest.Mock }).calls).toHaveBeenCalledTimes(1);
	});

	it('still reads a legacy data-wrapped body', async () => {
		const c = ctx({ data: { hosts: { central: 'https://legacy-central', regional: 'https://legacy-regional' } } });
		await expect(resolveHosts(c)).resolves.toEqual({ central: 'https://legacy-central', regional: 'https://legacy-regional' });
	});

	it('falls back to baseUrl for both planes when /v1/me fails or lacks hosts', async () => {
		await expect(resolveHosts(ctx(null, { fail: true }))).resolves.toEqual({ central: 'https://api.stg.brault.app', regional: 'https://api.stg.brault.app' });
		clearHostsCache();
		await expect(resolveHosts(ctx({ object: 'me' }))).resolves.toEqual({ central: 'https://api.stg.brault.app', regional: 'https://api.stg.brault.app' });
	});
});
