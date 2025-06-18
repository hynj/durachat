import { anthropic, AnthropicProviderOptions, createAnthropic } from "@ai-sdk/anthropic";
import { streamText } from 'ai';
import { AIProvider, ChatMessage, ProviderConfig, StreamTextOptions, MessageContent, UsageInfo } from './types';
import { messages } from "../db/user/data";
import { getLogger } from '../utils/logger';
import { calculateCost } from './pricing';
import { getProviderModels, supportsThinking } from '../config/models';

export class AnthropicProvider implements AIProvider {
  readonly name = 'anthropic';
  readonly models = getProviderModels('anthropic');
  
  private client: ReturnType<typeof createAnthropic>;
  private config: ProviderConfig;

  constructor(config: ProviderConfig) {
    const logger = getLogger();
    logger.debug('PROVIDER', 'Anthropic provider constructor', {
      provider: 'anthropic',
      has_api_key: !!config.apiKey,
      key_length: config.apiKey?.length || 0,
      model: config.model
    });
    
    this.config = config;
    try {
      this.client = createAnthropic({ 
        apiKey: config.apiKey 
      });
      logger.debug('PROVIDER', 'Anthropic client created successfully', {
        provider: 'anthropic',
        model: config.model
      });
    } catch (error) {
      logger.error('PROVIDER', 'Failed to create Anthropic client', {
        provider: 'anthropic',
        model: config.model,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  async *streamText(options: StreamTextOptions): AsyncIterable<string> {
    const logger = getLogger();
    const startTime = Date.now();
    let fullText = '';
    
    try {
      logger.debug('PROVIDER', 'Anthropic streamText called', {
        provider: 'anthropic',
        model: this.config.model,
        message_count: options.messages.length,
        messages: options.messages.map(m => ({
          role: m.role,
          content_type: typeof m.content,
          content_length: typeof m.content === 'string' ? m.content.length : m.content.length
        }))
      });

      // Convert multimodal messages to AI SDK format
      const aiMessages = options.messages.map(msg => {
        if (typeof msg.content === 'string') {
          return {
            role: msg.role,
            content: msg.content
          };
        } else {
          // Handle multimodal content
          return {
            role: msg.role,
            content: msg.content.map((part: MessageContent) => {
              if (part.type === 'text') {
                return {
                  type: 'text',
                  text: part.text
                };
              } else if (part.type === 'image') {
                return {
                  type: 'image',
                  image: part.image
                };
              }
              return part;
            })
          };
        }
      });

      logger.debug('PROVIDER', 'Creating Anthropic stream', {
        provider: 'anthropic',
        model: this.config.model
      });

      const isThinking = supportsThinking(this.config.model);

      const providerOptions = {
          anthropic: {
            thinking: {
              type: isThinking ? 'enabled' : 'disabled',
              budgetTokens: 15000
            },
          } satisfies AnthropicProviderOptions
        }
  
      const result = streamText({
        model: this.client(this.config.model),
        messages: aiMessages,
        providerOptions: providerOptions
      });
      
      logger.debug('PROVIDER', 'Anthropic result object created', {
        provider: 'anthropic',
        model: this.config.model,
        result_keys: Object.keys(result),
        thinking_callbacks: {
          on_thinking_start: !!options.onThinkingStart,
          on_thinking_token: !!options.onThinkingToken,
          on_thinking_end: !!options.onThinkingEnd
        }
      });
      
      // Use fullStream to handle both reasoning and text-delta events
      let thinkingStarted = false;
      let responseStarted = false;
      let eventCount = 0;

      for await (const part of result.fullStream) {
        eventCount++;
        logger.debug('PROVIDER', 'Received fullStream event', {
          provider: 'anthropic',
          model: this.config.model,
          event_count: eventCount,
          event_type: part.type
        });
        
        if (part.type === 'error') {
          logger.error('PROVIDER', 'Error event in fullStream', {
            provider: 'anthropic',
            model: this.config.model,
            error_part: part
          });
          throw new Error(`Anthropic API error: ${JSON.stringify(part)}`);
        } else if (part.type === 'reasoning') {
          // Start thinking phase if not already started
          if (!thinkingStarted && options.onThinkingStart) {
            options.onThinkingStart();
            thinkingStarted = true;
          }
          
          // Send reasoning tokens immediately (no batching needed for Anthropic)
          if (part.textDelta && options.onThinkingToken) {
            options.onThinkingToken(part.textDelta);
          }
        } else if (part.type === 'text-delta') {
          // End thinking phase and start response phase
          if (thinkingStarted && options.onThinkingEnd) {
            options.onThinkingEnd();
            thinkingStarted = false;
          }
          
          if (!responseStarted && options.onResponseStart) {
            options.onResponseStart();
            responseStarted = true;
          }
          
          // Stream response content
          if (part.textDelta) {
            fullText += part.textDelta;
            if (options.onToken) {
              options.onToken(part.textDelta);
            }
            yield part.textDelta;
          }
        }
      }

      logger.debug('PROVIDER', 'fullStream completed', {
        provider: 'anthropic',
        model: this.config.model,
        total_events: eventCount
      });

      // Clean up thinking phase if it never ended
      if (thinkingStarted && options.onThinkingEnd) {
        options.onThinkingEnd();
      }

      // Get final usage information from the result
      const finalResult = await result;
      const usage = await finalResult.usage;
      const endTime = Date.now();
      
      if (options.onComplete) {
        const usageInfo: UsageInfo = {
          promptTokens: usage?.promptTokens || 0,
          completionTokens: usage?.completionTokens || 0,
          totalTokens: usage?.totalTokens || 0,
          cost: calculateCost(this.config.model, usage?.promptTokens || 0, usage?.completionTokens || 0),
          duration: endTime - startTime
        };
        
        logger.debug('PROVIDER', 'Anthropic usage calculated', {
          provider: 'anthropic',
          model: this.config.model,
          usage: usageInfo
        });
        
        options.onComplete(fullText, usageInfo);
      }
    } catch (error) {
      logger.error('PROVIDER', 'Anthropic streaming error', {
        provider: 'anthropic',
        model: this.config.model,
        error_message: error instanceof Error ? error.message : String(error),
        stack_trace: error instanceof Error ? error.stack : undefined
      });
      
      if (options.onError) {
        options.onError(error as Error);
      }
      throw error;
    }
  }
}
