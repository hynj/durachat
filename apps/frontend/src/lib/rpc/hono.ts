import { hc } from 'hono/client';
import type { rpcAppType } from 'backend/src/shared/types';
import { getApiUrl } from '$lib/rpc/utils';
import { dev } from '$app/environment';

const init: RequestInit | undefined = dev ? { credentials: 'include' } : undefined;

export const client = hc<rpcAppType>(getApiUrl(), { init });

export function getTimeoutClient() {
	const init: RequestInit = {
		credentials: 'include',
		signal: AbortSignal.timeout(1_000)
	};
	const rpcClient = hc<rpcAppType>(getApiUrl(), { init });
	return rpcClient;
}
