<script lang="ts">
	import { onMount } from 'svelte';

	import { client } from '$lib/rpc/hono';
	import { db } from '$lib/sqlocal/test';
	import { groceries } from '$lib/sqlocal/test';

	let codeAvailable = $state(null);

	const register = async () => {
		const res = await client.auth.register.$post({
			query: {}
		});

		console.log(res);
		if (res.ok) {
			const resUnpacked = await res.json();
			console.log(resUnpacked);
			codeAvailable = resUnpacked.code;
		}
	};

	onMount(async () => {
		console.log('mounted');
	});
</script>

<h1>Register</h1>

<button onclick={register}>Register</button>

{#if codeAvailable}
	<h2>Code: {codeAvailable}</h2>
{/if}
