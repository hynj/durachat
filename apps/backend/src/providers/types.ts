export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string | MessageContent[];
}

export interface MessageContent {
  type: 'text' | 'image';
  text?: string;
  image?: string; // Base64 encoded image or URL
}

export interface ProviderConfig {
  apiKey: string;
  model: string;
  [key: string]: any;
}

export interface UsageInfo {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost: number; // Cost in cents
  duration: number; // Duration in milliseconds
}

export interface StreamTextOptions {
  messages: ChatMessage[];
  onToken?: (token: string) => void;
  onComplete?: (fullText: string, usage?: UsageInfo) => void;
  onError?: (error: Error) => void;
  onThinkingStart?: () => void;
  onThinkingToken?: (token: string) => void;
  onThinkingEnd?: () => void;
  onResponseStart?: () => void;
  reasoningEffort?: string; // For models that support reasoning effort levels (low, medium, high)
}

export interface AIProvider {
  readonly name: string;
  readonly models: string[];
  
  streamText(options: StreamTextOptions): AsyncIterable<string>;
}

export type ProviderName = 'google' | 'openai' | 'anthropic' | 'openrouter';

export interface ProviderFactory {
  createProvider(name: ProviderName, config: ProviderConfig): AIProvider;
  getSupportedProviders(): ProviderName[];
}
