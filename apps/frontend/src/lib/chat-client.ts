import { dev } from '$app/environment';

type ChatMessage = {
	type:
		| 'conversation_created'
		| 'text'
		| 'done'
		| 'error'
		| 'catchup'
		| 'new_message'
		| 'thinking_start'
		| 'thinking'
		| 'thinking_end'
		| 'response_start'
		| 'connected'
		| 'disconnected';
	conversationId?: string;
	messageId?: string;
	content?: string;
	message?: string;
	conversation?: any;
	messages?: any[];
	hasActiveStream?: boolean;
	isThinking?: boolean;
};

type ChatEventHandler = (message: ChatMessage) => void;

export class ChatWebSocketClient {
	private ws: WebSocket | null = null;
	private url: string;
	private handlers: Map<string, ChatEventHandler[]> = new Map();
	private reconnectAttempts = 0;
	private maxReconnectAttempts = 5;
	private reconnectDelay = 1000;
	private conversationId: string | null = null;

	constructor(baseUrl: string = 'ws://localhost:5787') {
		if (dev) {
			const url = new URL('/test/ws', 'ws://localhost:5787');
			url.protocol = 'ws';
			this.url = url.toString();
		} else {
			const url = new URL('/test/ws', location.href);
			url.protocol = 'wss';
			this.url = url.toString();
		}
	}

	connect(conversationId?: string): Promise<void> {
		return new Promise((resolve, reject) => {
			try {
				const url = new URL(this.url);
				if (conversationId) {
					url.searchParams.set('conversationId', conversationId);
					this.conversationId = conversationId;
				}
				url.searchParams.set('sessionId', `session-${Date.now()}`);

				this.ws = new WebSocket(url.toString());

				this.ws.onopen = () => {
					this.reconnectAttempts = 0;
					this.emit('connected', { type: 'connected' } as ChatMessage);
					resolve();
				};

				this.ws.onmessage = (event) => {
					try {
						const message: ChatMessage = JSON.parse(event.data);
						this.emit(message.type, message);

						if (message.type === 'conversation_created' && message.conversationId) {
							this.conversationId = message.conversationId;
						}
					} catch (error) {
						console.error('Failed to parse WebSocket message:', error);
					}
				};

				this.ws.onerror = (error) => {
					console.error('WebSocket error:', error);
					this.emit('error', { type: 'error', message: 'Connection error' });
					reject(error);
				};

				this.ws.onclose = () => {
					this.emit('disconnected', { type: 'disconnected' } as ChatMessage);
					this.handleReconnect();
				};
			} catch (error) {
				reject(error);
			}
		});
	}

	private handleReconnect() {
		if (this.reconnectAttempts < this.maxReconnectAttempts) {
			this.reconnectAttempts++;
			const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

			setTimeout(() => {
				console.log(`Reconnecting... attempt ${this.reconnectAttempts}`);
				this.connect(this.conversationId || undefined);
			}, delay);
		}
	}

	startChat(
		prompt: string,
		conversationId?: string,
		messageId?: string,
		provider?: string,
		model?: string,
		reasoningEffort?: string
	) {
		console.log('🚀 ChatClient.startChat called with:', {
			prompt,
			conversationId,
			messageId,
			provider,
			model,
			reasoningEffort
		});
		console.log(
			'🔗 WebSocket state:',
			this.ws?.readyState,
			'Open?',
			this.ws?.readyState === WebSocket.OPEN
		);

		if (this.ws && this.ws.readyState === WebSocket.OPEN) {
			const payload = {
				type: 'start_chat',
				prompt,
				conversationId: conversationId || this.conversationId,
				messageId,
				provider,
				model,
				reasoningEffort
			};
			console.log('📤 Sending WebSocket message:', payload);
			this.ws.send(JSON.stringify(payload));
		} else {
			console.error('❌ WebSocket not connected - cannot send message');
			throw new Error('WebSocket not connected');
		}
	}

	switchConversation(conversationId: string | null) {
		console.log('🔄 ChatClient.switchConversation called with:', conversationId);

		if (this.ws && this.ws.readyState === WebSocket.OPEN) {
			const payload = {
				type: 'switch_conversation',
				conversationId: conversationId
			};
			console.log('📤 Sending switch_conversation message:', payload);
			this.ws.send(JSON.stringify(payload));
		} else {
			console.error('❌ WebSocket not connected - cannot switch conversation');
			throw new Error('WebSocket not connected');
		}
	}

	deleteConversation(conversationId: string) {
		console.log('🗑️ ChatClient.deleteConversation called with:', conversationId);

		if (this.ws && this.ws.readyState === WebSocket.OPEN) {
			const payload = {
				type: 'delete_conversation',
				conversationId: conversationId
			};
			console.log('📤 Sending delete_conversation message:', payload);
			this.ws.send(JSON.stringify(payload));
		} else {
			console.error('❌ WebSocket not connected - cannot delete conversation');
			throw new Error('WebSocket not connected');
		}
	}

	ping() {
		if (this.ws && this.ws.readyState === WebSocket.OPEN) {
			this.ws.send(JSON.stringify({ type: 'ping' }));
		}
	}

	on(event: string, handler: ChatEventHandler) {
		if (!this.handlers.has(event)) {
			this.handlers.set(event, []);
		}
		this.handlers.get(event)!.push(handler);
	}

	off(event: string, handler: ChatEventHandler) {
		const handlers = this.handlers.get(event);
		if (handlers) {
			const index = handlers.indexOf(handler);
			if (index > -1) {
				handlers.splice(index, 1);
			}
		}
	}

	private emit(event: string, message: ChatMessage) {
		const handlers = this.handlers.get(event);
		if (handlers) {
			handlers.forEach((handler) => handler(message));
		}
	}

	disconnect() {
		if (this.ws) {
			this.ws.close();
			this.ws = null;
		}
	}

	getConversationId(): string | null {
		return this.conversationId;
	}

	isConnected(): boolean {
		return this.ws ? this.ws.readyState === WebSocket.OPEN : false;
	}
}
