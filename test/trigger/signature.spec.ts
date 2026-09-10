import { createHmac } from 'crypto';
import { verifySignature } from '../../nodes/BraultTrigger/signature';

const secret = 'whsec_test';
const body = JSON.stringify({ id: 'evt_1', type: 'file.created' });
const sig = (t: number, s = secret) => createHmac('sha256', s).update(`${t}.${body}`).digest('hex');

describe('verifySignature', () => {
	const now = 1_800_000_000;
	it('accepts a fresh valid signature', () => {
		expect(verifySignature(`t=${now},v1=${sig(now)}`, body, secret, now)).toEqual({ ok: true });
	});
	it('accepts when any v1 matches (secret roll grace)', () => {
		expect(verifySignature(`t=${now},v1=${sig(now, 'old')},v1=${sig(now)}`, body, secret, now)).toEqual({ ok: true });
	});
	it('rejects an expired timestamp', () => {
		expect(verifySignature(`t=${now - 301},v1=${sig(now - 301)}`, body, secret, now)).toEqual({ ok: false, reason: 'expired' });
	});
	it('rejects a tampered body', () => {
		expect(verifySignature(`t=${now},v1=${sig(now)}`, body + ' ', secret, now)).toEqual({ ok: false, reason: 'mismatch' });
	});
	it('rejects missing or malformed headers', () => {
		expect(verifySignature(undefined, body, secret, now)).toEqual({ ok: false, reason: 'missing' });
		expect(verifySignature('nonsense', body, secret, now)).toEqual({ ok: false, reason: 'malformed' });
	});
});
