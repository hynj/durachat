import { client } from '$lib/rpc/hono';

export interface Attachment {
	id: string;
	fileName: string;
	fileSize: number;
	mimeType: string;
	storageUrl: string;
	messageId: string;
	createdAt: string;
}

export async function uploadAttachment(
	file: File,
	conversationId: string,
	messageId?: string
): Promise<Attachment> {
	const formData: any = {
		file: file,
		conversationId: conversationId
	};

	if (messageId) {
		formData.messageId = messageId;
	}

	formData.conversationId = conversationId;

	console.log('MessageID:', messageId);

	const uploadResponse = await client.attachments.$post({
		form: formData
	});

	if (!uploadResponse.ok) {
		const errorData = await uploadResponse.json().catch(() => ({ error: 'Upload failed' }));
		throw new Error(errorData.error || `Upload failed with status ${uploadResponse.status}`);
	}

	return await uploadResponse.json();
}

export function formatFileSize(bytes: number): string {
	if (bytes === 0) return '0 Bytes';
	const k = 1024;
	const sizes = ['Bytes', 'KB', 'MB', 'GB'];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function getFileTypeFromMime(
	mimeType: string
): 'image' | 'video' | 'audio' | 'document' | 'text' | 'other' {
	if (mimeType.startsWith('image/')) return 'image';
	if (mimeType.startsWith('video/')) return 'video';
	if (mimeType.startsWith('audio/')) return 'audio';
	if (
		mimeType.includes('pdf') ||
		mimeType.includes('document') ||
		mimeType.includes('spreadsheet') ||
		mimeType.includes('presentation')
	)
		return 'document';
	if (
		mimeType.includes('text') ||
		mimeType.includes('json') ||
		mimeType.includes('xml') ||
		mimeType.includes('javascript') ||
		mimeType.includes('css')
	)
		return 'text';
	return 'other';
}
