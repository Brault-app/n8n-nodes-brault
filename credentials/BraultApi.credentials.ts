import type { IAuthenticateGeneric, ICredentialTestRequest, ICredentialType, INodeProperties } from 'n8n-workflow';

export class BraultApi implements ICredentialType {
	name = 'braultApi';
	displayName = 'Brault API';
	icon = 'file:brault.svg' as const;
	documentationUrl = 'https://developers.brault.app/docs/get-an-api-key';
	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description: 'Create one under Settings → Developers in Brault. Starts with bsk_.',
		},
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: 'https://api.brault.app',
			description: 'Leave the default unless Brault support gave you another host',
		},
	];
	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: { headers: { Authorization: '=Bearer {{$credentials.apiKey}}' } },
	};
	test: ICredentialTestRequest = {
		request: { baseURL: '={{$credentials.baseUrl.replace(/\\/+$/, "")}}', url: '/v1/me' },
	};
}
