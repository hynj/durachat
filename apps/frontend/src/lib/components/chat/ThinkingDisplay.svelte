<script lang="ts">
	let {
		isThinking = $bindable(false),
		currentThinkingContent = $bindable(''),
		thinkingMessageId = $bindable(null)
	}: {
		isThinking: boolean;
		currentThinkingContent: string;
		thinkingMessageId: string | null;
	} = $props();
</script>

<!-- Current thinking section (for streaming message) -->
{#if isThinking && currentThinkingContent && thinkingMessageId}
	<div class="mx-auto max-w-4xl">
		<div class="mb-4">
			<details class="bg-muted/20 border-border/30 rounded-lg border" open>
				<summary
					class="text-muted-foreground hover:bg-muted/30 cursor-pointer rounded-lg p-3 text-sm font-medium transition-colors"
				>
					Reasoning...
				</summary>
				<div
					class="text-muted-foreground border-border/20 mt-2 border-t px-3 pt-1 pb-3 font-mono text-xs leading-relaxed whitespace-pre-wrap"
				>
					{currentThinkingContent}
				</div>
			</details>
		</div>
	</div>
{/if}

<style>
	.terminal-cursor {
		display: inline-block;
		position: relative;
	}

	.terminal-cursor::after {
		content: '|';
		animation: terminal-cursor-content 1.2s infinite;
	}

	@keyframes terminal-cursor-content {
		0%, 33.32% {
			content: '|';
		}
		33.33%, 66.65% {
			content: '||';
		}
		66.66%, 100% {
			content: '|||';
		}
	}
</style>
