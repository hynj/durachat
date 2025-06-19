<script lang="ts">
	import { onMount, onDestroy, getContext } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { ChatWebSocketClient } from '$lib/chat-client';
	import {
		createConversation,
		createMessage,
		getConversation,
		getConversationMessages,
		updateMessage,
		appendToMessage,
		updateConversationTitle,
		generateConversationTitle
	} from '$lib/db/queries';
	import type { Conversation, Message, Usage } from '$lib/db/database';
	import { dbService } from '$lib/db/database';
	import ChatMessages from './ChatMessages.svelte';
	import ChatInput from './ChatInput.svelte';
	import ThinkingDisplay from './ThinkingDisplay.svelte';
	import ConnectionStatus from './ConnectionStatus.svelte';
	import ReasoningEffortSelector from '../reasoning-effort-selector.svelte';
	import { client } from '$lib/rpc/hono';
	import { setWebSocketConnected } from '$lib/stores/connection.svelte';

	let chatClient: ChatWebSocketClient;
	let messages: (Message & { usage?: Usage })[] = $state([]);
	let currentMessage = '';
	let inputValue = $state('');
	let isConnected = $state(false);
	let isStreaming = $state(false);
	let isWaitingForResponse = $state(false);
	let conversationId: string | null = $state(null);
	let currentStreamingMessageId: string | null = null;
	let conversation: Conversation | null = $state(null);
	let isThinking = $state(false);
	let currentThinkingContent = $state('');
	let thinkingMessageId: string | null = $state(null);
	let reasoningHistory: Map<string, string> = $state(new Map());
	let currentProvider = $state('anthropic');
	let currentModel = $state('claude-sonnet-4-20250514');
	let reasoningEffort = $state('medium');
	let showScrollButton = $state(false);
	let messagesContainer: HTMLElement;
	let pendingAttachments: any[] = $state([]);
	let pendingMessageId: string | null = $state(null);
	let allAttachments: Array<{ attachment: any; messageId: string | null }> = $state([]);
	let userSettings: { credits: number } | null = $state(null);

	// Get conversation refresh context
	const conversationRefreshContext =
		getContext<() => { trigger: () => void; version: () => number }>('conversation-refresh');
	const conversationRefresh = conversationRefreshContext?.();

	// Computed values for attachment preview
	let currentMessageAttachments = $derived(
		pendingMessageId
			? allAttachments
					.filter((item) => item.messageId === pendingMessageId)
					.map((item) => item.attachment)
			: []
	);

	// Simple reactive conversation ID from URL
	let urlConversationId = $derived($page.url.searchParams.get('c'));
	
	// Database ready state
	let isDatabaseReady = $derived(dbService.isInitialized());

	// Load conversation when URL changes - but prevent infinite loops
	let lastLoadedConversationId: string | null = null;
	let isLoadingConversation = false;

	$effect(async () => {
		const newConversationId = urlConversationId;

		// Only load if conversation ID changed, different from what we last loaded, and not currently loading
		if (newConversationId !== lastLoadedConversationId && !isLoadingConversation) {
			console.log('🔄 Loading conversation:', newConversationId, 'previous:', lastLoadedConversationId);
			isLoadingConversation = true;
			lastLoadedConversationId = newConversationId;

			// Reset state when conversation changes
			conversationId = newConversationId;
			conversation = null;
			messages = [];
			isStreaming = false;
			currentStreamingMessageId = null;
			currentMessage = '';
			isThinking = false;
			currentThinkingContent = '';
			thinkingMessageId = null;
			reasoningHistory.clear();

			// Load existing conversation via WebSocket
			console.log('🔍 WebSocket state - chatClient exists:', !!chatClient, 'isConnected:', chatClient?.isConnected());
			if (chatClient && chatClient.isConnected()) {
				try {
					// Try to get conversation from frontend SQLite first (for immediate UI)
					if (newConversationId) {
						// Wait for database to be ready before attempting to load
						if (dbService.isInitialized()) {
							const localConversation = await getConversation(newConversationId);
							console.log('📄 Local SQLite conversation result:', localConversation);
							conversation = localConversation;
							if (conversation) {
								currentProvider = conversation.provider || 'openai';
								currentModel = conversation.model || 'gpt-4.1-mini';
								
								// Also load messages from SQLite for immediate display
								try {
									const localMessages = await getConversationMessages(newConversationId);
									console.log('📄 Local SQLite messages result:', localMessages.length, 'messages');
									messages = localMessages;
								} catch (error) {
									console.error('Failed to load messages from SQLite:', error);
								}
							} else {
								// If we have a conversation ID but no conversation exists,
								// this is a new conversation from the "New" button
								console.log('🆕 New conversation with pre-generated ID:', newConversationId);
							}
						} else {
							console.log('⏳ Database not ready yet, will load conversation from WebSocket response');
						}
					}

					// Request conversation data from backend via WebSocket
					console.log('🔄 Requesting conversation switch via WebSocket:', newConversationId);
					await chatClient.switchConversation(newConversationId);
				} catch (error) {
					console.error('Failed to load conversation:', error);
				}
			} else {
				// WebSocket not ready yet, try to load from local SQLite if database is ready
				if (newConversationId) {
					try {
						if (dbService.isInitialized()) {
							conversation = await getConversation(newConversationId);
							if (conversation) {
								currentProvider = conversation.provider || 'openai';
								currentModel = conversation.model || 'gpt-4.1-mini';
								
								// Also load messages from SQLite for immediate display
								try {
									const localMessages = await getConversationMessages(newConversationId);
									console.log('📄 Local SQLite messages result (fallback):', localMessages.length, 'messages');
									messages = localMessages;
								} catch (error) {
									console.error('Failed to load messages from SQLite (fallback):', error);
								}
							} else {
								// If we have a conversation ID but no conversation exists,
								// this is a new conversation from the "New" button
								console.log('🆕 New conversation with pre-generated ID:', newConversationId);
							}
						} else {
							console.log('⏳ Database and WebSocket not ready yet, conversation will load when ready');
						}
					} catch (error) {
						console.error('Failed to load conversation from local SQLite:', error);
					}
				}
			}

			// No need to reconnect WebSocket - we'll send conversationId with each message

			isLoadingConversation = false;
		}
	});

	// Note: Removed database retry effect - let WebSocket handle all loading for consistency

	// Load user settings
	async function loadUserSettings() {
		try {
			const response = await client['user-settings'].$get();
			if (response.ok) {
				const settings = await response.json();
				userSettings = {
					credits: settings.credits
				};
			}
		} catch (error) {
			console.error('Failed to load user settings:', error);
		}
	}

	onMount(async () => {
		// Load user settings first
		await loadUserSettings();

		chatClient = new ChatWebSocketClient();

		// Set up event handlers
		chatClient.on('connected', () => {
			console.log('🔌 WebSocket connected');
			isConnected = true;
			setWebSocketConnected(true);
			
			// If we have a conversation ID from URL but no conversation data, request it
			const currentUrlConversationId = $page.url.searchParams.get('c');
			console.log('🔍 On WebSocket connect - URL conversation ID:', currentUrlConversationId);
			if (currentUrlConversationId) {
				console.log('🔄 WebSocket connected, requesting conversation from URL:', currentUrlConversationId);
				chatClient.switchConversation(currentUrlConversationId);
			}
		});

		chatClient.on('disconnected', () => {
			console.log('🔌 WebSocket disconnected');
			isConnected = false;
			setWebSocketConnected(false);
		});

		// No longer need conversation_created handler - frontend generates IDs

		chatClient.on('conversation_switched', async (message) => {
			console.log('🔄 Received conversation_switched:', message);
			console.log('🔍 Current conversation ID from URL:', urlConversationId);

			if (message.conversationId) {
				// Update conversation metadata
				if (message.conversation) {
					conversation = {
						id: message.conversation.id,
						title: message.conversation.title,
						model: message.conversation.model,
						provider: message.conversation.provider,
						createdAt: new Date(message.conversation.createdAt),
						updatedAt: new Date(message.conversation.updatedAt)
					};
					// Update current provider/model state
					currentProvider = conversation.provider || 'anthropic';
					currentModel = conversation.model || 'claude-sonnet-4-20250514';
				}

				// Update messages from backend
				if (message.messages) {
					messages = message.messages.map((msg: any) => ({
						id: msg.id,
						role: msg.role,
						content: msg.content,
						isStreaming: msg.isStreaming || false,
						streamCompleted: msg.streamCompleted !== false
					}));
				}

				// Set streaming state if there's an active stream
				if (message.hasActiveStream) {
					isStreaming = true;
					const streamingMsg = messages.find((m: any) => m.isStreaming);
					if (streamingMsg) {
						currentStreamingMessageId = streamingMsg.id;
						currentMessage = streamingMsg.content;
					}
				}
			} else {
				// Switching to new conversation
				conversation = null;
				messages = [];
				isStreaming = false;
				currentStreamingMessageId = null;
				currentMessage = '';
				isThinking = false;
				currentThinkingContent = '';
				thinkingMessageId = null;
				reasoningHistory.clear();
			}
		});

		chatClient.on('conversation_updated', async (message) => {
			console.log('🔄 Received conversation_updated:', message);

			if (message.conversation && message.conversation.id === conversationId) {
				// Update the conversation in both local state and database
				conversation = {
					id: message.conversation.id,
					title: message.conversation.title,
					model: message.conversation.model,
					provider: message.conversation.provider,
					createdAt: new Date(message.conversation.createdAt),
					updatedAt: new Date(message.conversation.updatedAt)
				};

				// Update local database
				await updateConversationTitle(message.conversation.id, message.conversation.title);

				console.log('✅ Updated conversation title:', message.conversation.title);

				// Trigger sidebar refresh
				window.dispatchEvent(
					new CustomEvent('conversation-title-updated', {
						detail: { conversationId: message.conversation.id, title: message.conversation.title }
					})
				);
			}
		});

		chatClient.on('text', async (message) => {
			console.log('📥 Received text message:', message);
			if (message.content) {
				const targetMessageId = message.messageId || currentStreamingMessageId;
				console.log(
					'🎯 Processing text for message:',
					targetMessageId,
					'current streaming:',
					currentStreamingMessageId
				);
				if (targetMessageId) {
					// If this is our own streaming message, update currentMessage
					if (targetMessageId === currentStreamingMessageId) {
						currentMessage += message.content;
						console.log('📝 Updated currentMessage length:', currentMessage.length);

						// Backend handles all message storage - no need to save locally
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

		chatClient.on('done', async (message) => {
			console.log('✅ Received done message:', message);
			const targetMessageId = message.messageId || currentStreamingMessageId;

			// Only reset streaming state if this is our own message
			if (targetMessageId === currentStreamingMessageId) {
				console.log('🏁 Stopping streaming for message:', targetMessageId);
				isWaitingForResponse = false;
				isStreaming = false;
				currentStreamingMessageId = null;
				currentMessage = '';

				// Backend handles message completion - no need to update locally
			}

			// Update the message streaming state and usage data in UI
			if (targetMessageId) {
				messages = messages.map((msg) =>
					msg.id === targetMessageId
						? {
								...msg,
								streaming: false,
								isStreaming: false,
								streamCompleted: true,
								usage: message.usage || msg.usage
							}
						: msg
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

		chatClient.on('new_message', async (message) => {
			console.log('📨 Received new_message:', message);
			if (message.message) {
				// Add new message from another window
				const newMessage = {
					id: message.message.id,
					role: message.message.role,
					content: message.message.content,
					model: message.message.model,
					provider: message.message.provider,
					streaming: message.message.streaming || false
				};

				console.log('➕ Adding new message to UI:', newMessage);
				messages = [...messages, newMessage];

				// If it's a streaming assistant message, track it
				if (newMessage.streaming && newMessage.role === 'assistant') {
					console.log('🎯 Setting currentStreamingMessageId:', newMessage.id);
					// Don't stop waiting here - let thinking_start or response_start handle it
					isStreaming = true;
					currentStreamingMessageId = newMessage.id;
					currentMessage = newMessage.content;
				}

				// Title generation is now handled by the backend
			}
		});

		chatClient.on('error', (message) => {
			console.error('❌ Chat error:', message.message);
			isWaitingForResponse = false;
			isStreaming = false;
			isThinking = false;
		});

		// Thinking phase event handlers
		chatClient.on('thinking_start', (message) => {
			console.log('🧠 Thinking phase started:', message);
			isThinking = true;
			isWaitingForResponse = false;
			currentThinkingContent = '';
			thinkingMessageId = message.messageId || currentStreamingMessageId;
		});

		chatClient.on('thinking', (message) => {
			console.log('🧠 Received thinking token:', message);
			if (message.content) {
				currentThinkingContent += message.content;
			}
		});

		chatClient.on('thinking_end', (message) => {
			console.log('🧠 Thinking phase ended:', message);
			const msgId = message.messageId || thinkingMessageId;
			if (msgId && currentThinkingContent) {
				// Store the complete reasoning for this message
				reasoningHistory.set(msgId, currentThinkingContent);
			}
			// Keep thinking content for current display until response starts
		});

		chatClient.on('response_start', (message) => {
			console.log('💬 Response phase started:', message);
			// Thinking is done, now starting the actual response
			isThinking = false;
			isWaitingForResponse = false;
		});

		// Connect to WebSocket without conversation ID - we'll send it with messages
		try {
			await chatClient.connect();
		} catch (error) {
			console.error('Failed to connect:', error);
		}
	});

	onDestroy(() => {
		if (chatClient) {
			chatClient.disconnect();
		}
	});

	let isCreatingConversation = false;

	async function ensureMessageId(): Promise<string> {
		if (!pendingMessageId) {
			const { uuidv7 } = await import('uuidv7');
			pendingMessageId = uuidv7();
		}
		return pendingMessageId;
	}

	async function handleAttachmentUploaded(attachment: any) {
		console.log('Attachment uploaded:', attachment);
		console.log('Current pendingMessageId:', pendingMessageId);
		console.log('Current pendingAttachments length:', pendingAttachments.length);

		// If we have a pending message ID, associate the attachment with it
		if (pendingMessageId) {
			allAttachments.push({ attachment, messageId: pendingMessageId });
			console.log(
				'Added to allAttachments for message:',
				pendingMessageId,
				'total:',
				allAttachments.length
			);
		} else {
			// Store in pending attachments for later association
			pendingAttachments = [...pendingAttachments, attachment];
			console.log('Added to pendingAttachments, new length:', pendingAttachments.length);
		}
	}

	async function sendMessage() {
		console.log('🚀 sendMessage called');
		console.log('📋 State check:', {
			inputValue: inputValue.trim(),
			isConnected,
			isStreaming,
			isCreatingConversation,
			conversationId
		});

		if (!inputValue.trim() || !isConnected || isStreaming || isCreatingConversation) {
			console.log('❌ sendMessage early return - conditions not met');
			return;
		}

		const messageContent = inputValue.trim();
		inputValue = '';
		console.log('💬 Message content:', messageContent);

		try {
			// Generate message ID on frontend
			const { uuidv7 } = await import('uuidv7');
			const messageId = pendingMessageId || uuidv7();
			console.log('🎲 Generated/using message ID:', messageId);

			// Create or get conversation
			let currentConversationId = conversationId;
			console.log('🆔 Current conversation ID:', currentConversationId);

			// Check if we need to create a new conversation
			let needsNewConversation = false;

			if (!currentConversationId && !isCreatingConversation) {
				console.log('🆕 Creating new conversation (no ID)');
				needsNewConversation = true;
				isCreatingConversation = true;
				currentConversationId = uuidv7();
				console.log('🎲 Generated conversation ID:', currentConversationId);
			} else if (currentConversationId && !conversation && !isCreatingConversation) {
				console.log('🆕 Creating new conversation (pre-assigned ID)');
				needsNewConversation = true;
				isCreatingConversation = true;
			}

			if (needsNewConversation && currentConversationId) {
				// Create conversation with our generated ID and current provider/model selection
				console.log('💾 Creating conversation with state:', { currentProvider, currentModel });
				await createConversation({
					id: currentConversationId,
					title: '...',
					model: currentModel,
					provider: currentProvider
				});
				console.log('💾 Created conversation in local database');

				// Trigger sidebar refresh for new conversation
				if (conversationRefresh) {
					console.log('🔄 Triggering sidebar refresh for new conversation');
					conversationRefresh.trigger();
				} else {
					console.warn('❌ conversationRefresh context not available');
				}

				// Update state but prevent reactive loop
				lastLoadedConversationId = currentConversationId;
				conversationId = currentConversationId;
				conversation = await getConversation(currentConversationId);
				console.log('📝 Updated conversation state:', conversation);

				// Update URL with new conversation ID (only if it wasn't already set)
				if (!conversationId && currentConversationId) {
					const url = new URL($page.url);
					url.searchParams.set('c', currentConversationId);
					goto(url.toString(), { replaceState: true, noScroll: true });
					console.log('🔗 Updated URL:', url.toString());
				}

				isCreatingConversation = false;
			}

			console.log('🔄 Setting waiting state');
			isWaitingForResponse = true;
			isStreaming = false;
			console.log('🔄 isWaitingForResponse:', isWaitingForResponse);
			currentMessage = '';
			currentStreamingMessageId = null;

			console.log('📤 Sending message via WebSocket:', {
				messageContent,
				messageId,
				conversationId: currentConversationId,
				webSocketConnected: chatClient?.isConnected()
			});

			// Send with pre-generated message ID and current provider/model
			chatClient.startChat(
				messageContent,
				currentConversationId || undefined,
				messageId || undefined,
				currentProvider,
				currentModel,
				reasoningEffort
			);

			// Transfer pending attachments to the message
			if (pendingAttachments.length > 0 && messageId) {
				for (const attachment of pendingAttachments) {
					allAttachments.push({ attachment, messageId });
				}
			}

			// Reset pending state
			pendingMessageId = null;
			pendingAttachments = [];
		} catch (error) {
			console.error('Failed to save message:', error);
		}
	}

	async function handleProviderChange(provider: string, model: string) {
		console.log('🔄 Frontend Provider changed:', { provider, model, conversationId });
		console.log('🔄 State before change:', { currentProvider, currentModel });

		// Update local state
		currentProvider = provider;
		currentModel = model;

		console.log('🔄 State after change:', { currentProvider, currentModel });

		// If we have a conversation, update it in the database
		if (conversation) {
			try {
				// Update conversation in local database
				await updateConversationTitle(conversation.id, conversation.title);
				// Note: We would need a new function to update provider/model in local DB
				// For now, the backend update is sufficient

				console.log('✅ Provider switched successfully');
			} catch (error) {
				console.error('Failed to update conversation locally:', error);
			}
		}
	}

	function handleReasoningEffortChange(effort: string) {
		console.log('🧠 Reasoning effort changed:', effort);
		reasoningEffort = effort;
		// TODO: Store in user preferences or conversation settings
	}

	function checkScrollPosition() {
		if (!messagesContainer) return;

		const { scrollTop, scrollHeight, clientHeight } = messagesContainer;
		const isNearBottom = scrollHeight - scrollTop - clientHeight < 150;

		// Show button if we're not near the bottom and there are messages
		showScrollButton = !isNearBottom && messages.length > 0;
	}

	function scrollToBottom() {
		if (messagesContainer) {
			messagesContainer.scrollTo({
				top: messagesContainer.scrollHeight,
				behavior: 'smooth'
			});
		}
	}

	// Auto-scroll disabled - users can manually scroll to bottom using the button
	// $effect(() => {
	// 	if (messagesContainer && messages.length > 0) {
	// 		const { scrollTop, scrollHeight, clientHeight } = messagesContainer;
	// 		const wasAtBottom = scrollHeight - scrollTop - clientHeight < 150;

	// 		if (wasAtBottom || isStreaming || isThinking) {
	// 			setTimeout(() => scrollToBottom(), 10);
	// 		}
	// 	}
	// });

	// Update scroll button visibility when messages change
	$effect(() => {
		if (messagesContainer && messages.length > 0) {
			setTimeout(() => checkScrollPosition(), 50);
		}
	});

	// Auto-scroll for thinking content disabled
	// $effect(() => {
	// 	if (messagesContainer && isThinking && currentThinkingContent) {
	// 		const { scrollTop, scrollHeight, clientHeight } = messagesContainer;
	// 		const wasAtBottom = scrollHeight - scrollTop - clientHeight < 150;

	// 		if (wasAtBottom) {
	// 			setTimeout(() => scrollToBottom(), 10);
	// 		}
	// 	}
	// });
</script>

<div class="relative h-screen">
	<!-- Chat Messages - extends full height with bottom padding for input area -->
	<div
		bind:this={messagesContainer}
		onscroll={checkScrollPosition}
		class="h-full overflow-x-visible overflow-y-auto p-4 pb-40"
	>
		<ChatMessages
			bind:messages
			bind:allAttachments
			bind:isStreaming
			bind:reasoningHistory
			{conversationId}
		/>

		<ThinkingDisplay bind:isThinking bind:currentThinkingContent bind:thinkingMessageId />

		<ConnectionStatus
			bind:isWaitingForResponse
			bind:showScrollButton
			{isThinking}
			onScrollToBottom={scrollToBottom}
		/>
	</div>

	<ChatInput
		bind:inputValue
		bind:isConnected
		bind:isStreaming
		bind:conversationId
		bind:currentProvider
		bind:currentModel
		bind:reasoningEffort
		bind:pendingAttachments
		bind:currentMessageAttachments
		bind:pendingMessageId
		onSendMessage={sendMessage}
		onProviderChange={handleProviderChange}
		onReasoningEffortChange={handleReasoningEffortChange}
		onAttachmentUploaded={handleAttachmentUploaded}
		{ensureMessageId}
		{userSettings}
	/>
</div>
