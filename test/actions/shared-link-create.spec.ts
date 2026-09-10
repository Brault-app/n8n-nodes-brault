import { buildSharedLinkBody } from '../../nodes/Brault/actions/shared-link-create';

describe('buildSharedLinkBody', () => {
	it('nests target and forwards options', () => {
		expect(
			buildSharedLinkBody({
				targetType: 'file',
				targetId: 'f1',
				access: 'review',
				password: '',
				expires_at: '2026-12-31T00:00:00.000Z',
				anonymous_comments: true,
			}),
		).toEqual({
			target: { type: 'file', id: 'f1' },
			access: 'review',
			expires_at: '2026-12-31T00:00:00.000Z',
			anonymous_comments: true,
		});
	});

	it('omits empty password and undefined fields', () => {
		expect(buildSharedLinkBody({ targetType: 'board', targetId: 'b1' })).toEqual({
			target: { type: 'board', id: 'b1' },
		});
	});

	it('forwards board_views when provided', () => {
		expect(
			buildSharedLinkBody({
				targetType: 'board',
				targetId: 'b1',
				board_views: { default: 'gallery', allowed: ['gallery', 'table'] },
			}),
		).toEqual({
			target: { type: 'board', id: 'b1' },
			board_views: { default: 'gallery', allowed: ['gallery', 'table'] },
		});
	});
});
