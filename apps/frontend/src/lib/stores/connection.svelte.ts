// WebSocket connection status store
let _isWebSocketConnected = $state(false);

export function getWebSocketConnected() {
	return _isWebSocketConnected;
}

export function setWebSocketConnected(connected: boolean) {
	_isWebSocketConnected = connected;
}
