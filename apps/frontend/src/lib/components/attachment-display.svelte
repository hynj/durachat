<script lang="ts">
	import { File, Image, FileText, Video, Music, Download } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import {
		formatFileSize,
		getFileTypeFromMime,
		type Attachment
	} from '$lib/services/attachment-service';

	let { attachments } = $props();

	function getFileIcon(attachment: Attachment) {
		const type = getFileTypeFromMime(attachment.mimeType);
		switch (type) {
			case 'image':
				return Image;
			case 'video':
				return Video;
			case 'audio':
				return Music;
			case 'text':
			case 'document':
				return FileText;
			default:
				return File;
		}
	}

	function handleDownload(attachment: Attachment) {
		// In a real implementation, you'd fetch the file from R2
		console.log('Download attachment:', attachment);
	}

	function handlePreview(attachment: Attachment) {
		const type = getFileTypeFromMime(attachment.mimeType);
		if (type === 'image') {
			// Show image preview
			console.log('Preview image:', attachment);
		}
	}

	$effect(() => {
		console.log('Attachments changed:', attachments);
	});
</script>

{#if attachments.length > 0}
	<div class="mt-3 space-y-2">
		{#each attachments as attachment}
			<div class="bg-muted/20 flex items-center gap-2 rounded border p-2 text-sm">
				<svelte:component this={getFileIcon(attachment)} class="text-muted-foreground h-4 w-4" />
				<div class="min-w-0 flex-1">
					<div class="truncate font-medium">{attachment.fileName}</div>
					<div class="text-muted-foreground text-xs">{formatFileSize(attachment.fileSize)}</div>
				</div>
				<div class="flex gap-1">
					{#if getFileTypeFromMime(attachment.mimeType) === 'image'}
						<Button
							variant="ghost"
							size="sm"
							class="h-7 w-7 p-0"
							onclick={() => handlePreview(attachment)}
						>
							<Image class="h-3 w-3" />
						</Button>
					{/if}
					<Button
						variant="ghost"
						size="sm"
						class="h-7 w-7 p-0"
						onclick={() => handleDownload(attachment)}
					>
						<Download class="h-3 w-3" />
					</Button>
				</div>
			</div>
		{/each}
	</div>
{/if}
