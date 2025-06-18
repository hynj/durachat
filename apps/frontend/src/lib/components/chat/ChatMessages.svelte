<script lang="ts">
	import type { Message, Usage } from '$lib/db/database';
	import AttachmentDisplay from '../attachment-display.svelte';
	import MessageStats from '../message-stats.svelte';
	import { marked } from 'marked';
	import markedKatex from 'marked-katex-extension';
	import Prism from 'prismjs';
	import 'prismjs/themes/prism-tomorrow.css';

	// Only load the most common languages
	import 'prismjs/components/prism-typescript';
	import 'prismjs/components/prism-python';
	import 'prismjs/components/prism-json';

	let {
		messages = $bindable([]),
		allAttachments = $bindable([]),
		isStreaming = $bindable(false),
		reasoningHistory = $bindable(new Map())
	}: {
		messages: (Message & { usage?: Usage; responseTime?: number })[];
		allAttachments: Array<{ attachment: any; messageId: string | null }>;
		isStreaming: boolean;
		reasoningHistory: Map<string, string>;
	} = $props();

	// Calculate response time for each message
	function calculateResponseTime(message: Message & { usage?: Usage; responseTime?: number }): number | undefined {
		if (message.responseTime) {
			return message.responseTime;
		}
		
		// Primary source: usage.duration from backend
		if (message.usage && 'duration' in message.usage) {
			return (message.usage as any).duration;
		}
		
		// Fallback: if we have usage with createdAt, calculate a simple estimate
		if (message.usage?.createdAt && message.updatedAt) {
			const requestTime = new Date(message.createdAt).getTime();
			const responseTime = new Date(message.updatedAt).getTime();
			return responseTime - requestTime;
		}
		
		return undefined;
	}

	// Configure marked with KaTeX and custom styling
	marked.use(
		markedKatex({
			throwOnError: false,
			output: 'html'
		})
	);

	marked.use({
		renderer: {
			code(token: any) {
				const { text, lang } = token;

				// Language mapping for common aliases
				const languageMap: Record<string, string> = {
					js: 'javascript',
					ts: 'typescript',
					py: 'python',
					cs: 'csharp',
					'c++': 'clike',
					cpp: 'clike',
					sh: 'bash',
					shell: 'bash',
					yml: 'yaml',
					html: 'markup',
					htm: 'markup'
				};

				const normalizedLang = lang ? languageMap[lang.toLowerCase()] || lang.toLowerCase() : '';

				let highlightedCode;
				try {
					if (normalizedLang && Prism.languages[normalizedLang]) {
						highlightedCode = Prism.highlight(
							text,
							Prism.languages[normalizedLang],
							normalizedLang
						);
					} else {
						// Fallback to escaped plain text
						highlightedCode = text
							.replace(/&/g, '&amp;')
							.replace(/</g, '&lt;')
							.replace(/>/g, '&gt;')
							.replace(/"/g, '&quot;')
							.replace(/'/g, '&#039;');
					}
				} catch (error) {
					console.warn('Syntax highlighting failed for language:', normalizedLang, error);
					highlightedCode = text
						.replace(/&/g, '&amp;')
						.replace(/</g, '&lt;')
						.replace(/>/g, '&gt;')
						.replace(/"/g, '&quot;')
						.replace(/'/g, '&#039;');
				}

				const langClass = normalizedLang ? `language-${normalizedLang}` : '';
				return `<pre class="bg-muted border border-border rounded-md p-4 my-4 overflow-x-auto relative shadow-sm"><code class="${langClass}">${highlightedCode}</code>${lang ? `<span class="absolute top-2 right-2 text-xs text-muted-foreground/70 font-mono bg-background/80 px-2 py-1 rounded">${lang}</span>` : ''}</pre>`;
			},

			codespan(token: any) {
				return `<code class="bg-muted px-1 py-0.5 rounded text-sm font-mono">${token.text}</code>`;
			}
		}
	});

	function renderMarkdown(content: string): string {
		try {
			const result = marked(content);
			return typeof result === 'string' ? result : String(result);
		} catch (error) {
			console.error('Markdown parsing error:', error);
			return content; // Fallback to original content
		}
	}
</script>

<div class="mx-auto max-w-4xl space-y-4 pt-8">
	{#each messages as message, index}
		<div class="animate-in slide-in-from-bottom-4 fade-in duration-300">
			{#if message.role === 'user'}
				<!-- User message in bubble -->
				<div class="mb-12 flex justify-end">
					<div class="bg-muted text-muted-foreground max-w-[80%] rounded-sm p-3">
						<div class="text-sm leading-relaxed whitespace-pre-wrap">
							{message.content}
						</div>
						<!-- User message attachments -->
						{#if allAttachments.some((item) => item.messageId === message.id)}
							<AttachmentDisplay
								attachments={allAttachments
									.filter((item) => item.messageId === message.id)
									.map((item) => item.attachment)}
							/>
						{/if}
					</div>
				</div>
			{:else}
				<!-- Reasoning section for this message (if exists) -->
				{#if reasoningHistory.has(message.id)}
					<div class="mb-4">
						<details class="bg-muted/20 border-border/30 rounded-lg border">
							<summary
								class="text-muted-foreground hover:bg-muted/30 cursor-pointer rounded-lg p-3 text-sm font-medium transition-colors"
							>
								Reasoning
							</summary>
							<div
								class="text-muted-foreground border-border/20 mt-2 border-t px-3 pt-1 pb-3 font-mono text-xs leading-relaxed whitespace-pre-wrap"
							>
								{reasoningHistory.get(message.id)}
							</div>
						</details>
					</div>
				{/if}

				<!-- Assistant message with markdown formatting -->
				<div
					class="group markdown-content animate-in fade-in slide-in-from-bottom-2 pt-6 pb-2 text-base leading-7 duration-500 ease-out cursor-default"
				>
					{@html renderMarkdown(String(message.content))}
					<!-- Assistant message attachments -->
					{#if allAttachments.some((item) => item.messageId === message.id)}
						<AttachmentDisplay
							attachments={allAttachments
								.filter((item) => item.messageId === message.id)
								.map((item) => item.attachment)}
						/>
					{/if}

					<!-- Message Statistics -->
					{#if message.role === 'assistant' && !message.streaming && !message.isStreaming}
						<MessageStats 
							usage={message.usage} 
							model={message.model} 
							provider={message.provider}
							responseTime={calculateResponseTime(message)} 
						/>
					{/if}
				</div>
			{/if}

			<!-- Separator after assistant messages (except last) -->
			{#if message.role === 'assistant' && index < messages.length - 1}
				<div class="border-border/30 mt-8 border-t"></div>
			{/if}
		</div>
	{/each}
</div>

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
