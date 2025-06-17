import { PUBLIC_HONO_API_URL } from '$env/static/public';
import { dev } from '$app/environment';

export function getApiUrl() {
	if (dev) {
		return PUBLIC_HONO_API_URL;
	}
	return '';
}
