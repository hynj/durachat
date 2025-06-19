<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Sparkles, BookOpen, Code, Lightbulb } from 'lucide-svelte';

	interface Props {
		username?: string;
		onSuggestedPrompt: (prompt: string) => void;
	}

	let { username, onSuggestedPrompt }: Props = $props();

	let selectedCategory = $state('create');

	const suggestions = [
		{
			id: 'create',
			icon: Sparkles,
			label: 'Create',
			prompt: 'Help me create a new project or feature'
		},
		{
			id: 'explore',
			icon: BookOpen,
			label: 'Explore',
			prompt: 'I want to explore and learn about a topic'
		},
		{
			id: 'code',
			icon: Code,
			label: 'Code',
			prompt: 'Help me with coding or technical problems'
		},
		{
			id: 'learn',
			icon: Lightbulb,
			label: 'Learn',
			prompt: 'Teach me something new or explain a concept'
		}
	];

	const categoryQuestions = {
		create: [
			'Write a short story about a robot discovering emotions',
			'Help me outline a sci-fi novel set in a post-apocalyptic world',
			'Create a character profile for a complex villain with sympathetic motives',
			'Give me 5 creative writing prompts for flash fiction'
		],
		explore: [
			'Good books for fans of Rick Rubin',
			'Countries ranked by number of corgis',
			'Most successful companies in the world',
			'How much does Claude cost?'
		],
		code: [
			'Write code to invert a binary search tree in Python',
			"What's the difference between Promise.all and Promise.allSettled?",
			"Explain React's useEffect cleanup function",
			'Best practices for error handling in async/await'
		],
		learn: [
			"Beginner's guide to TypeScript",
			'Explain the CAP theorem in distributed systems',
			'Why is AI so expensive?',
			'Are black holes real?'
		]
	};

	let currentQuestions = $derived(categoryQuestions[selectedCategory as keyof typeof categoryQuestions]);
</script>

<div class="flex flex-col items-center justify-center h-full p-8 text-center">
	<div class="max-w-2xl mx-auto">
		<h1 class="text-4xl font-semibold text-gray-900 dark:text-gray-100 mb-8">
			How can I help you{username ? `, ${username}` : ''}?
		</h1>

		<!-- Suggestion buttons -->
		<div class="flex flex-wrap gap-4 justify-center mb-12">
			{#each suggestions as suggestion}
				{@const Icon = suggestion.icon}
				<Button
					variant={selectedCategory === suggestion.id ? "default" : "outline"}
					class="flex items-center gap-2 px-6 py-3 text-sm font-medium rounded-full hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
					onclick={() => selectedCategory = suggestion.id}
				>
					<Icon class="w-4 h-4" />
					{suggestion.label}
				</Button>
			{/each}
		</div>

		<!-- Sample questions -->
		<div class="space-y-4">
			{#each currentQuestions as question}
				<button
					class="block w-full text-left p-4 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-gray-700 dark:text-gray-300"
					onclick={() => onSuggestedPrompt(question)}
				>
					{question}
				</button>
			{/each}
		</div>
	</div>
</div>