<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import {
		Paperclip,
		Upload,
		X,
		File,
		Image,
		FileText,
		Video,
		Music,
		Check,
		AlertCircle
	} from 'lucide-svelte';
	import { uploadAttachment } from '$lib/services/attachment-service';
	import { toast } from 'svelte-sonner';

	/*
	export let conversationId: string | null = null;
	export let messageId: string | null = null;
	export let disabled = false;
	export let onAttachmentUploaded: (attachment: any) => void = () => {};
	export let ensureMessageId: (() => Promise<string>) | null = null;
  */

	let { conversationId, messageId, disabled, onAttachmentUploaded, ensureMessageId } = $props();

	let fileInput: HTMLInputElement;
	let isDragOver = $state(false);
	let isUploading = $state(false);
	let uploadProgress = $state(0);
	let selectedFiles: File[] = $state([]);
	let showFileList = $state(false);

	const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
	const ALLOWED_TYPES = [
		'image/*',
		'text/*',
		'application/pdf',
		'application/json',
		'application/xml',
		'application/zip',
		'video/*',
		'audio/*'
	];

	function handleFileSelect() {
		fileInput?.click();
	}

	async function handleFileInput(event: Event) {
		const target = event.target as HTMLInputElement;
		if (target.files) {
			await addFiles(Array.from(target.files));
		}
	}

	async function addFiles(files: File[]) {
		const validFiles = files.filter((file) => {
			if (file.size > MAX_FILE_SIZE) {
				toast(`File "${file.name}" is too large. Maximum size is 10MB.`, { icon: AlertCircle });
				return false;
			}
			return true;
		});

		if (validFiles.length > 0) {
			// Ensure we have a message ID when files are selected
			if (ensureMessageId) {
				await ensureMessageId();
			}

			selectedFiles = [...selectedFiles, ...validFiles];
			showFileList = true;
		}
	}

	function removeFile(index: number) {
		selectedFiles = selectedFiles.filter((_, i) => i !== index);
		if (selectedFiles.length === 0) {
			showFileList = false;
		}
	}

	async function uploadFiles() {
		if (!conversationId || selectedFiles.length === 0) {
			return;
		}

		isUploading = true;
		uploadProgress = 0;

		try {
			const uploadPromises = selectedFiles.map(async (file, index) => {
				const attachment = await uploadAttachment(file, conversationId);
				uploadProgress = ((index + 1) / selectedFiles.length) * 100;
				return attachment;
			});

			const attachments = await Promise.all(uploadPromises);

			// Call callback for each uploaded attachment
			attachments.forEach((attachment) => {
				onAttachmentUploaded(attachment);
			});

			// Clear files after successful upload
			selectedFiles = [];
			showFileList = false;

			toast(
				`Successfully uploaded ${attachments.length} file${attachments.length !== 1 ? 's' : ''}`,
				{ icon: Check }
			);
		} catch (error) {
			console.error('Upload failed:', error);
			toast('Upload failed. Please try again.', { icon: AlertCircle });
		} finally {
			isUploading = false;
			uploadProgress = 0;
		}
	}

	function handleDragOver(event: DragEvent) {
		event.preventDefault();
		isDragOver = true;
	}

	function handleDragLeave(event: DragEvent) {
		event.preventDefault();
		isDragOver = false;
	}

	async function handleDrop(event: DragEvent) {
		event.preventDefault();
		isDragOver = false;

		if (event.dataTransfer?.files) {
			await addFiles(Array.from(event.dataTransfer.files));
		}
	}

	function getFileIcon(file: File) {
		if (file.type.startsWith('image/')) return Image;
		if (file.type.startsWith('video/')) return Video;
		if (file.type.startsWith('audio/')) return Music;
		if (file.type.includes('text') || file.type.includes('json') || file.type.includes('xml'))
			return FileText;
		return File;
	}

	function formatFileSize(bytes: number) {
		if (bytes === 0) return '0 Bytes';
		const k = 1024;
		const sizes = ['Bytes', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
	}
</script>

<div class="relative">
	<!-- File Input (Hidden) -->
	<input
		bind:this={fileInput}
		type="file"
		multiple
		accept={ALLOWED_TYPES.join(',')}
		onchange={handleFileInput}
		class="hidden"
	/>

	<!-- Attach Button -->
	<Button variant="ghost" size="sm" class="h-8 px-2 text-xs" onclick={handleFileSelect} {disabled}>
		<Paperclip class="mr-1 h-3 w-3" />
		Attach
	</Button>

	<!-- File List Popup -->
	{#if showFileList}
		<div
			class="bg-background border-border absolute bottom-full left-0 z-50 mb-2 w-80 rounded-lg border p-3 shadow-lg"
		>
			<div class="mb-3 flex items-center justify-between">
				<h4 class="text-sm font-medium">Selected Files</h4>
				<Button
					variant="ghost"
					size="sm"
					class="h-6 w-6 p-0"
					onclick={() => {
						selectedFiles = [];
						showFileList = false;
					}}
				>
					<X class="h-3 w-3" />
				</Button>
			</div>

			<!-- File List -->
			<div class="max-h-40 space-y-2 overflow-y-auto">
				{#each selectedFiles as file, index}
					<div class="bg-muted/20 flex items-center gap-2 rounded p-2 text-xs">
						<svelte:component this={getFileIcon(file)} class="text-muted-foreground h-4 w-4" />
						<div class="min-w-0 flex-1">
							<div class="truncate font-medium">{file.name}</div>
							<div class="text-muted-foreground">{formatFileSize(file.size)}</div>
						</div>
						<Button variant="ghost" size="sm" class="h-6 w-6 p-0" onclick={() => removeFile(index)}>
							<X class="h-3 w-3" />
						</Button>
					</div>
				{/each}
			</div>

			<!-- Upload Progress -->
			{#if isUploading}
				<div class="mt-3">
					<div class="mb-1 flex items-center justify-between text-xs">
						<span>Uploading...</span>
						<span>{Math.round(uploadProgress)}%</span>
					</div>
					<div class="bg-muted h-2 w-full rounded-full">
						<div
							class="bg-primary h-2 rounded-full transition-all duration-300"
							style="width: {uploadProgress}%"
						></div>
					</div>
				</div>
			{:else}
				<!-- Upload Button -->
				<div class="mt-3 flex gap-2">
					<Button
						size="sm"
						class="flex-1"
						onclick={uploadFiles}
						disabled={selectedFiles.length === 0 || !conversationId}
					>
						<Upload class="mr-1 h-3 w-3" />
						Upload {selectedFiles.length} file{selectedFiles.length !== 1 ? 's' : ''}
					</Button>
				</div>
			{/if}
		</div>
	{/if}

	<!-- Drag and Drop Overlay -->
	{#if isDragOver}
		<div
			class="bg-background/80 fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm"
			ondragover={handleDragOver}
			ondragleave={handleDragLeave}
			ondrop={handleDrop}
		>
			<div class="border-primary bg-background rounded-lg border-2 border-dashed p-8 text-center">
				<Upload class="text-primary mx-auto mb-2 h-8 w-8" />
				<p class="text-lg font-medium">Drop files here to attach</p>
				<p class="text-muted-foreground text-sm">Up to 10MB per file</p>
			</div>
		</div>
	{/if}
</div>

<!-- Global drag handlers -->
<svelte:window ondragover={handleDragOver} ondragleave={handleDragLeave} ondrop={handleDrop} />
