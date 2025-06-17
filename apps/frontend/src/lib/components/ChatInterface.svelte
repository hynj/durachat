<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { ChatWebSocketClient } from '$lib/chat-client';

	let chatClient: ChatWebSocketClient;
	let messages: Array<{
		id: string;
		role: 'user' | 'assistant';
		content: string;
		streaming?: boolean;
	}> = [];
	let currentMessage = '';
	let inputValue = '';
	let isConnected = false;
	let isStreaming = false;
	let conversationId: string | null = null;
	let currentStreamingMessageId: string | null = null;

	onMount(async () => {
		chatClient = new ChatWebSocketClient();

		// Check if we have a conversation ID in the URL
		conversationId = $page.url.searchParams.get('c');

		// Set up event handlers
		chatClient.on('connected', () => {
			isConnected = true;
		});

		chatClient.on('disconnected', () => {
			isConnected = false;
		});

		chatClient.on('conversation_created', (message) => {
			if (message.conversationId) {
				conversationId = message.conversationId;

				// Update URL with conversation ID (only for new conversations)
				const url = new URL($page.url);
				url.searchParams.set('c', message.conversationId);
				goto(url.toString(), { replaceState: true, noScroll: true });
			}
		});

		chatClient.on('text', (message) => {
			if (message.content) {
				const targetMessageId = message.messageId || currentStreamingMessageId;
				if (targetMessageId) {
					// If this is our own streaming message, update currentMessage
					if (targetMessageId === currentStreamingMessageId) {
						currentMessage += message.content;
					}

					// Update the message in the list
					messages = messages.map((msg) => {
						if (msg.id === targetMessageId) {
							const newContent =
								targetMessageId === currentStreamingMessageId
									? currentMessage
									: msg.content + message.content;
							return { ...msg, content: newContent };
						}
						return msg;
					});
				}
			}
		});

		chatClient.on('done', (message) => {
			const targetMessageId = message.messageId || currentStreamingMessageId;

			// Only reset streaming state if this is our own message
			if (targetMessageId === currentStreamingMessageId) {
				isStreaming = false;
				currentStreamingMessageId = null;
				currentMessage = '';
			}

			// Update the message streaming state
			if (targetMessageId) {
				messages = messages.map((msg) =>
					msg.id === targetMessageId ? { ...msg, streaming: false } : msg
				);
			}
		});

		chatClient.on('catchup', (message) => {
			if (message.messages) {
				messages = message.messages.map((msg: any) => ({
					id: msg.id,
					role: msg.role,
					content: msg.content,
					streaming: msg.isStreaming
				}));
			}
			if (message.hasActiveStream) {
				isStreaming = true;
				const streamingMsg = messages.find((m) => m.streaming);
				if (streamingMsg) {
					currentStreamingMessageId = streamingMsg.id;
					currentMessage = streamingMsg.content;
				}
			}
		});

		chatClient.on('new_message', (message) => {
			if (message.message) {
				// Add new message from another window
				const newMessage = {
					id: message.message.id,
					role: message.message.role,
					content: message.message.content,
					streaming: message.message.streaming || false
				};

				messages = [...messages, newMessage];

				// If it's a streaming assistant message, track it
				if (newMessage.streaming && newMessage.role === 'assistant') {
					// Don't update currentStreamingMessageId if we're already streaming our own
					if (!isStreaming) {
						currentStreamingMessageId = newMessage.id;
					}
				}
			}
		});

		chatClient.on('error', (message) => {
			console.error('Chat error:', message.message);
			isStreaming = false;
		});

		// Connect to WebSocket
		try {
			await chatClient.connect(conversationId || undefined);
		} catch (error) {
			console.error('Failed to connect:', error);
		}
	});

	onDestroy(() => {
		if (chatClient) {
			chatClient.disconnect();
		}
	});

	function sendMessage() {
		if (!inputValue.trim() || !isConnected || isStreaming) return;

		const userMessage = {
			id: `user-${Date.now()}`,
			role: 'user' as const,
			content: inputValue.trim()
		};

		// Create assistant message placeholder
		const assistantMessage = {
			id: `assistant-${Date.now()}`,
			role: 'assistant' as const,
			content: '',
			streaming: true
		};

		messages = [...messages, userMessage, assistantMessage];
		isStreaming = true;
		currentMessage = '';
		currentStreamingMessageId = assistantMessage.id;

		chatClient.startChat(inputValue.trim());
		inputValue = '';
	}

	function handleKeyPress(event: KeyboardEvent) {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			sendMessage();
		}
	}
</script>

<div class="chat-container">
	<div class="chat-header">
		<h2>AI Chat</h2>
		<div class="connection-status">
			<span class="status-indicator" class:connected={isConnected}></span>
			{isConnected ? 'Connected' : 'Disconnected'}
		</div>
	</div>

	<div class="messages-container">
		{#each messages as message (message.id)}
			<div
				class="message"
				class:user={message.role === 'user'}
				class:assistant={message.role === 'assistant'}
			>
				<div class="message-role">{message.role}</div>
				<div class="message-content">
					{message.content}
					{#if message.streaming}
						<span class="cursor">▋</span>
					{/if}
				</div>
			</div>
		{/each}
	</div>
	<div class="input-container">
		<textarea
			bind:value={inputValue}
			on:keypress={handleKeyPress}
			placeholder="Type your message..."
			disabled={!isConnected || isStreaming}
			rows="3"
		></textarea>
		<button on:click={sendMessage} disabled={!isConnected || isStreaming || !inputValue.trim()}>
			{isStreaming ? 'Sending...' : 'Send'}
		</button>
	</div>
</div>

<style>
	.chat-container {
		max-width: 800px;
		margin: 0 auto;
		height: 80vh;
		display: flex;
		flex-direction: column;
		border: 1px solid #e1e5e9;
		border-radius: 8px;
		overflow: hidden;
	}

	.chat-header {
		padding: 1rem;
		background: #f8f9fa;
		border-bottom: 1px solid #e1e5e9;
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.chat-header h2 {
		margin: 0;
		color: #2d3748;
	}

	.connection-status {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.875rem;
		color: #64748b;
	}

	.status-indicator {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: #ef4444;
	}

	.status-indicator.connected {
		background: #10b981;
	}

	.messages-container {
		flex: 1;
		overflow-y: auto;
		padding: 1rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.message {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.message.user {
		align-items: flex-end;
	}

	.message.assistant {
		align-items: flex-start;
	}

	.message-role {
		font-size: 0.75rem;
		font-weight: 600;
		color: #64748b;
		text-transform: uppercase;
	}

	.message-content {
		max-width: 70%;
		padding: 0.75rem 1rem;
		border-radius: 1rem;
		white-space: pre-wrap;
	}

	.user .message-content {
		background: #3b82f6;
		color: white;
		border-bottom-right-radius: 0.25rem;
	}

	.assistant .message-content {
		background: #f1f5f9;
		color: #1e293b;
		border-bottom-left-radius: 0.25rem;
	}

	.cursor {
		animation: blink 1s infinite;
	}

	@keyframes blink {
		0%,
		50% {
			opacity: 1;
		}
		51%,
		100% {
			opacity: 0;
		}
	}

	.input-container {
		padding: 1rem;
		border-top: 1px solid #e1e5e9;
		background: white;
		display: flex;
		gap: 0.75rem;
	}

	textarea {
		flex: 1;
		padding: 0.75rem;
		border: 1px solid #d1d5db;
		border-radius: 0.5rem;
		resize: vertical;
		font-family: inherit;
	}

	textarea:focus {
		outline: none;
		border-color: #3b82f6;
		box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
	}

	button {
		padding: 0.75rem 1.5rem;
		background: #3b82f6;
		color: white;
		border: none;
		border-radius: 0.5rem;
		font-weight: 500;
		cursor: pointer;
		transition: background 0.2s;
	}

	button:hover:not(:disabled) {
		background: #2563eb;
	}

	button:disabled {
		background: #9ca3af;
		cursor: not-allowed;
	}
</style>
