import { clearHostsCache, resolveHosts } from '../../nodes/Brault/transport/hosts';

function ctx(me: unknown, opts: { fail?: boolean } = {}) {
	const httpRequestWithAuthentication = jest.fn(async () => {
		if (opts.fail) throw new Error('boom');
		return { statusCode: 200, body: { data: me } };
	});
	return {
		calls: httpRequestWithAuthentication,
		getCredentials: jest.fn(async () => ({ apiKey: 'bsk_us_abcdefgh_rest', baseUrl: 'https://api.stg.brault.app/' })),
		helpers: { httpRequestWithAuthentication },
	} as never;
}

describe('resolveHosts', () => {
	beforeEach(() => clearHostsCache());

	it('reads hosts from GET /v1/me and strips the trailing slash from baseUrl', async () => {
		const c = ctx({ hosts: { central: 'https://api.stg.brault.app', regional: 'https://us.api.stg.brault.app' } });
		await expect(resolveHosts(c)).resolves.toEqual({ central: 'https://api.stg.brault.app', regional: 'https://us.api.stg.brault.app' });
		expect((c as never as { calls: jest.Mock }).calls.mock.calls[0][1]).toMatchObject({ method: 'GET', url: 'https://api.stg.brault.app/v1/me' });
	});

	it('caches per credential for ten minutes', async () => {
		const c = ctx({ hosts: { central: 'https://a', regional: 'https://b' } });
		await resolveHosts(c);
		await resolveHosts(c);
		expect((c as never as { calls: jest.Mock }).calls).toHaveBeenCalledTimes(1);
	});

	it('falls back to baseUrl for both planes when /v1/me fails or lacks hosts', async () => {
		await expect(resolveHosts(ctx(null, { fail: true }))).resolves.toEqual({ central: 'https://api.stg.brault.app', regional: 'https://api.stg.brault.app' });
		clearHostsCache();
		await expect(resolveHosts(ctx({}))).resolves.toEqual({ central: 'https://api.stg.brault.app', regional: 'https://api.stg.brault.app' });
	});
});
