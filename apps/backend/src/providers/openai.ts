import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from 'ai';
import { AIProvider, ChatMessage, ProviderConfig, StreamTextOptions, MessageContent, UsageInfo } from './types';
import { getLogger } from '../utils/logger';
import { calculateCost } from './pricing';
import { getProviderModels, supportsReasoningEffort, getDefaultReasoningEffort } from '../config/models';

export class OpenAIProvider implements AIProvider {
  readonly name = 'openai';
  readonly models = getProviderModels('openai');

  private client: ReturnType<typeof createOpenAI>;
  private config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
    this.client = createOpenAI({
      apiKey: config.apiKey,
      compatibility: "strict"
    });
  }

  async *streamText(options: StreamTextOptions): AsyncIterable<string> {
    const startTime = Date.now();
    let fullText = '';
    const logger = getLogger();
    try {
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

      // Check if this is a reasoning model using config
      const isReasoningModel = supportsReasoningEffort(this.config.model);

      if (isReasoningModel) {
        try {
          // Get reasoning effort from options or use default
          const reasoningEffort = options.reasoningEffort || getDefaultReasoningEffort(this.config.model) || 'medium';
          
          logger.debug('PROVIDER', 'Using reasoning model with effort level', {
            provider: 'openai',
            model: this.config.model,
            reasoningEffort: reasoningEffort
          });
          
          // Try Responses API for reasoning models
          const result = streamText({
            model: this.client.responses(this.config.model),
            messages: aiMessages,
            providerOptions: {
              openai: {
                reasoningSummary: 'auto',
                reasoningEffort: reasoningEffort
              }
            }
          });

          let thinkingStarted = false;
          let responseStarted = false;

          for await (const part of result.fullStream) {
            if (part.type === 'error') {
              logger.error('PROVIDER', 'Error event in fullStream', {
                provider: 'openai',
                model: this.config.model,
                error_part: part
              });
              throw new Error(`OpenAI Responses API error: ${JSON.stringify(part)}`);
            } else if (part.type === 'reasoning') {
              // Start thinking phase if not already started
              if (!thinkingStarted && options.onThinkingStart) {
                options.onThinkingStart();
                thinkingStarted = true;
              }

              // Stream reasoning content
              if (options.onThinkingToken && part.textDelta) {
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
              if (options.onToken && part.textDelta) {
                options.onToken(part.textDelta);
                fullText += part.textDelta;
              }
              yield part.textDelta;
            }
          }

          // Clean up thinking phase if it never ended
          if (thinkingStarted && options.onThinkingEnd) {
            options.onThinkingEnd();
          }

          // Get final usage information from the result
          const finalResult = await result;
          const endTime = Date.now();
          const usage = await finalResult.usage;

          if (options.onComplete) {
            const usageInfo: UsageInfo = {
              promptTokens: usage?.promptTokens || 0,
              completionTokens: usage?.completionTokens || 0,
              totalTokens: usage?.totalTokens || 0,
              cost: calculateCost(this.config.model, usage?.promptTokens || 0, usage?.completionTokens || 0),
              duration: endTime - startTime
            };

            options.onComplete(fullText, usageInfo);
          }
        } catch (responsesApiError) {
          logger.warn('PROVIDER', 'Responses API failed, falling back to regular API', {
            provider: 'openai',
            model: this.config.model,
            error_message: responsesApiError instanceof Error ? responsesApiError.message : String(responsesApiError)
          });

          // Fallback to regular chat API
          const result = streamText({
            model: this.client(this.config.model),
            messages: aiMessages,
            stream_options: { include_usage: true }
          });

          // Brief thinking simulation
          if (options.onThinkingStart) {
            options.onThinkingStart();
          }
          if (options.onThinkingToken) {
            options.onThinkingToken('Thinking...');
          }
          if (options.onThinkingEnd) {
            options.onThinkingEnd();
          }
          if (options.onResponseStart) {
            options.onResponseStart();
          }

          for await (const textPart of result.textStream) {
            fullText += textPart;
            if (options.onToken) {
              options.onToken(textPart);
            }
            yield textPart;
          }

          // Get final usage information from the fallback result
          const finalResult = await result;
          const endTime = Date.now();
          const usage = await finalResult.usage;

          if (options.onComplete) {
            const usageInfo: UsageInfo = {
              promptTokens: usage?.promptTokens || 0,
              completionTokens: usage?.completionTokens || 0,
              totalTokens: usage?.totalTokens || 0,
              cost: calculateCost(this.config.model, usage?.promptTokens || 0, usage?.completionTokens || 0),
              duration: endTime - startTime
            };

            options.onComplete(fullText, usageInfo);
          }
        }
      } else {
        // Use regular chat API for non-reasoning models
        const result = streamText({
          model: this.client(this.config.model),
          messages: aiMessages,
          stream_options: { include_usage: true }
        });

        if (options.onResponseStart) {
          options.onResponseStart();
        }

        for await (const textPart of result.textStream) {
          fullText += textPart;
          if (options.onToken) {
            options.onToken(textPart);
          }
          yield textPart;
        }

        // Get final usage information from the regular result
        const finalResult = await result;
        const endTime = Date.now();
        const usage = await finalResult.usage;

        if (options.onComplete) {
          const usageInfo: UsageInfo = {
            promptTokens: usage?.promptTokens || 0,
            completionTokens: usage?.completionTokens || 0,
            totalTokens: usage?.totalTokens || 0,
            cost: calculateCost(this.config.model, usage?.promptTokens || 0, usage?.completionTokens || 0),
            duration: endTime - startTime
          };

          options.onComplete(fullText, usageInfo);
        }
      }
    } catch (error) {
      logger.error('PROVIDER', 'OpenAI streaming error', {
        provider: 'openai',
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
