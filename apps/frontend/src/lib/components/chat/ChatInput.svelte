<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import { Send } from 'lucide-svelte';
	import ProviderSelector from '../provider-selector.svelte';
	import ReasoningEffortSelector from '../reasoning-effort-selector.svelte';
	import AttachmentUpload from '../attachment-upload.svelte';
	import AttachmentDisplay from '../attachment-display.svelte';

	let {
		inputValue = $bindable(''),
		isConnected = $bindable(false),
		isStreaming = $bindable(false),
		conversationId = $bindable(null),
		currentProvider = $bindable('anthropic'),
		currentModel = $bindable('claude-sonnet-4-20250514'),
		reasoningEffort = $bindable('medium'),
		pendingAttachments = $bindable([]),
		currentMessageAttachments = $bindable([]),
		pendingMessageId = $bindable(null),
		onSendMessage,
		onProviderChange,
		onReasoningEffortChange,
		onAttachmentUploaded,
		ensureMessageId,
		userSettings
	}: {
		inputValue: string;
		isConnected: boolean;
		isStreaming: boolean;
		conversationId: string | null;
		currentProvider: string;
		currentModel: string;
		reasoningEffort: string;
		pendingAttachments: any[];
		currentMessageAttachments: any[];
		pendingMessageId: string | null;
		onSendMessage: () => void;
		onProviderChange: (provider: string, model: string) => void;
		onReasoningEffortChange: (effort: string) => void;
		onAttachmentUploaded: (attachment: any) => void;
		ensureMessageId: () => Promise<string>;
		userSettings?: { credits: number } | null;
	} = $props();

	let totalAttachments = $derived(pendingAttachments.length + currentMessageAttachments.length);

	function handleKeyPress(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			onSendMessage();
		}
	}
</script>

<!-- Message Input - positioned absolutely at bottom -->
<div class="bg-background/80 absolute right-0 bottom-0 left-0 z-10 px-4 backdrop-blur-[2px]">
	<div class="relative mx-auto max-w-sm sm:max-w-lg md:max-w-2xl lg:max-w-4xl xl:max-w-5xl">
		<!-- Single unified input container -->
		<div class="bg-muted/10 relative overflow-visible rounded-t-lg border border-b-0">
			<!-- Gradient overlay positioned exactly at the input border -->
			<div
				class="to-background/25 pointer-events-none absolute -top-6 right-0 left-0 h-6 bg-gradient-to-t from-transparent"
			></div>

			<!-- Pending Attachments Preview -->
			{#if totalAttachments > 0}
				<div class="px-3 pt-3">
					<div class="text-muted-foreground mb-2 text-xs">
						Attachments ({pendingAttachments.length} pending, {currentMessageAttachments.length} for
						message, total: {totalAttachments}):
					</div>
					<AttachmentDisplay attachments={[...pendingAttachments, ...currentMessageAttachments]} />
				</div>
			{/if}

			<!-- Large Textarea -->
			<textarea
				bind:value={inputValue}
				placeholder="Type your message here..."
				class="placeholder:text-muted-foreground/60 min-h-[80px] w-full resize-none border-0 bg-transparent px-3 py-3 text-base focus:ring-0 focus:outline-none"
				disabled={!isConnected || isStreaming}
				onkeydown={handleKeyPress}
			></textarea>

			<!-- Bottom Bar with Model Selector and Actions -->
			<div class="flex items-center justify-between bg-transparent px-3 py-2">
				<div class="flex items-center gap-2">
					<!-- Compact Provider Selector -->
					<ProviderSelector
						{currentProvider}
						{currentModel}
						{conversationId}
						{onProviderChange}
						disabled={isStreaming}
						{userSettings}
					/>

					<!-- Reasoning Effort Selector -->
					<ReasoningEffortSelector
						modelId={currentModel}
						provider={currentProvider}
						{reasoningEffort}
						onReasoningEffortChange={onReasoningEffortChange}
						disabled={isStreaming}
					/>

					<!-- Action Buttons -->
					<!-- Removed non-functional buttons - will be replaced with dynamic capability-based controls -->
					<AttachmentUpload
						{conversationId}
						messageId={pendingMessageId}
						disabled={isStreaming}
						{onAttachmentUploaded}
						{ensureMessageId}
					/>
				</div>

				<!-- Send Button -->
				<Button
					onclick={onSendMessage}
					disabled={!isConnected || isStreaming || !inputValue.trim()}
					size="sm"
					class="h-8"
				>
					{#if isStreaming}
						<div
							class="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent"
						></div>
					{:else}
						<Send class="h-3 w-3" />
					{/if}
				</Button>
			</div>
		</div>

		<!-- Background extension with side borders -->
		<div class="bg-muted/10 h-1 border-r border-l"></div>
	</div>
</div>
