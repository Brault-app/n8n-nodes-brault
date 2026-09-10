import { createHmac, timingSafeEqual } from 'crypto';

export type SignatureResult = { ok: true } | { ok: false; reason: 'missing' | 'malformed' | 'expired' | 'mismatch' };

export function verifySignature(
	header: string | undefined,
	rawBody: Buffer | string,
	secret: string,
	nowSeconds: number = Math.floor(Date.now() / 1000),
	toleranceSeconds = 300,
): SignatureResult {
	if (!header) return { ok: false, reason: 'missing' };
	let t: number | undefined;
	const v1: string[] = [];
	for (const part of header.split(',')) {
		const [k, v] = part.trim().split('=');
		if (k === 't' && /^\d+$/.test(v ?? '')) t = Number(v);
		else if (k === 'v1' && /^[0-9a-f]+$/i.test(v ?? '')) v1.push(v.toLowerCase());
	}
	if (t === undefined || v1.length === 0) return { ok: false, reason: 'malformed' };
	if (Math.abs(nowSeconds - t) > toleranceSeconds) return { ok: false, reason: 'expired' };
	const payload = Buffer.concat([Buffer.from(`${t}.`), Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody)]);
	const expected = createHmac('sha256', secret).update(payload).digest('hex');
	const ok = v1.some(
		(candidate) =>
			candidate.length === expected.length && timingSafeEqual(Buffer.from(candidate, 'hex'), Buffer.from(expected, 'hex')),
	);
	return ok ? { ok: true } : { ok: false, reason: 'mismatch' };
}
