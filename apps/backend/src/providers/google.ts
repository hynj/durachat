import { createGoogleGenerativeAI, GoogleGenerativeAIProviderOptions } from "@ai-sdk/google";
import { streamText } from 'ai';
import { AIProvider, ChatMessage, ProviderConfig, StreamTextOptions, MessageContent, UsageInfo } from './types';
import { getLogger } from '../utils/logger';
import { calculateCost } from './pricing';
import { getProviderModels, supportsThinking } from '../config/models';

export class GoogleProvider implements AIProvider {
  readonly name = 'google';
  readonly models = getProviderModels('google');

  private client: ReturnType<typeof createGoogleGenerativeAI>;
  private config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
    this.client = createGoogleGenerativeAI({
      apiKey: config.apiKey
    });
  }

  async *streamText(options: StreamTextOptions): AsyncIterable<string> {
    const startTime = Date.now();
    let fullText = '';
    
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

      const logger = getLogger();
      logger.debug('PROVIDER', 'Google AI messages converted', {
        provider: 'google',
        model: this.config.model,
        message_count: aiMessages.length
      });

      // Check if this is a thinking model using config
      const isThinkingModel = supportsThinking(this.config.model);
      const isProModel = this.config.model.includes('pro');

      if (isThinkingModel) {
        logger.debug('PROVIDER', 'Using Gemini 2.5 thinking model', {
          provider: 'google',
          model: this.config.model,
          thinking_budget: isProModel ? 4096 : 2048
        });

        // Set thinking budget based on model
        const thinkingBudget = isProModel ? 4096 : 2048; // Pro: 128-32768, Flash: 0-24576

        // Get the actual model name (remove our custom suffix)
        const actualModelName = this.config.model.replace('-non-thinking', '');
        
        const result = streamText({
          model: this.client(`models/${actualModelName}`),
          messages: aiMessages,
          providerOptions: {
            google: {
              thinkingConfig: {
                thinkingBudget,
                includeThoughts: true
              }
            }
          }
        });

        let thinkingStarted = false;
        let responseStarted = false;
        let eventCount = 0;

        for await (const part of result.fullStream) {
          eventCount++;
          logger.debug('PROVIDER', 'Received fullStream event', {
            provider: 'google',
            model: this.config.model,
            event_count: eventCount,
            event_type: part.type
          });

          if (part.type === 'error') {
            logger.error('PROVIDER', 'Error event in fullStream', {
              provider: 'google',
              model: this.config.model,
              error_part: part
            });
            throw new Error(`Google Gemini API error: ${JSON.stringify(part)}`);
          } else if (part.type === 'reasoning') {
            // Start thinking phase if not already started
            if (!thinkingStarted && options.onThinkingStart) {
              options.onThinkingStart();
              thinkingStarted = true;
            }

            // Send reasoning tokens immediately (no batching needed for Google)
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
          provider: 'google',
          model: this.config.model,
          total_events: eventCount
        });

        // Clean up thinking phase if it never ended
        if (thinkingStarted && options.onThinkingEnd) {
          options.onThinkingEnd();
        }

        // Get final usage information from the result
        const finalResult = await result;
        const usage = await finalResult.usage; // Usage is a Promise, so await it
        const endTime = Date.now();
        
        // COMPREHENSIVE DEBUG: Examine ALL available objects and promises
        logger.debug('PROVIDER', 'Complete finalResult object structure', {
          provider: 'google',
          model: this.config.model,
          final_result_keys: Object.keys(finalResult),
          final_result_descriptors: Object.getOwnPropertyDescriptors(finalResult)
        });

        // Check all possible promises and objects that might contain token info
        const debugData: any = {
          provider: 'google',
          model: this.config.model,
          has_usage: !!usage,
          usage_raw: usage
        };

        // 1. Check reasoning data
        try {
          const reasoning = await finalResult.reasoning;
          debugData.has_reasoning = !!reasoning;
          debugData.reasoning_length = reasoning ? reasoning.length : 0;
          debugData.reasoning_sample = reasoning ? reasoning.substring(0, 100) + '...' : null;
        } catch (error) {
          debugData.reasoning_error = error instanceof Error ? error.message : String(error);
        }

        // 2. Check reasoning details promise
        try {
          const reasoningDetails = await finalResult.reasoningDetailsPromise;
          debugData.reasoning_details_full = JSON.stringify(reasoningDetails, null, 2);
          if (reasoningDetails?.status?.value) {
            const reasoningDetailsData = reasoningDetails.status.value[0];
            debugData.reasoning_details_object_keys = Object.keys(reasoningDetailsData);
            debugData.reasoning_details_object_full = reasoningDetailsData;
          }
        } catch (error) {
          debugData.reasoning_details_error = error instanceof Error ? error.message : String(error);
        }

        // 3. Check response for usage details
        try {
          const response = await finalResult.responsePromise;
          if (response?.candidates?.[0]?.content?.parts) {
            debugData.response_candidates = response.candidates.length;
            debugData.response_has_usage_metadata = !!response.usageMetadata;
            if (response.usageMetadata) {
              debugData.response_usage_metadata = response.usageMetadata;
            }
          }
        } catch (error) {
          debugData.response_error = error instanceof Error ? error.message : String(error);
        }

        // 6. Check steps for reasoning token breakdown
        try {
          const steps = await finalResult.stepsPromise;
          if (steps && Array.isArray(steps) && steps.length > 0) {
            const firstStep = steps[0];
            if (firstStep?.usage) {
              debugData.step_usage_structure = {
                usage_keys: Object.keys(firstStep.usage),
                usage_full: firstStep.usage,
                step_type: firstStep.stepType,
                has_reasoning: !!firstStep.reasoning,
                reasoning_length: firstStep.reasoning?.length || 0
              };
            }
          }
        } catch (error) {
          debugData.steps_error = error instanceof Error ? error.message : String(error);
        }

        // 7. Check toolCalls promise (if it exists)
        try {
          const toolCalls = await finalResult.toolCalls;
          debugData.tool_calls_keys = toolCalls ? Object.keys(toolCalls) : null;
          debugData.tool_calls_data = toolCalls;
        } catch (error) {
          debugData.tool_calls_error = error instanceof Error ? error.message : String(error);
        }

        logger.debug('PROVIDER', 'Google AI SDK reasoning token analysis (thinking model)', {
          provider: 'google',
          model: this.config.model,
          top_level_usage: usage,
          step_usage_structure: debugData.step_usage_structure,
          response_usage_metadata: debugData.response_usage_metadata,
          has_reasoning: debugData.has_reasoning,
          reasoning_length: debugData.reasoning_length
        });
        
        if (options.onComplete) {
          const usageInfo: UsageInfo = {
            promptTokens: usage?.promptTokens || 0,
            completionTokens: usage?.completionTokens || 0,
            totalTokens: usage?.totalTokens || 0,
            cost: calculateCost(this.config.model, usage?.promptTokens || 0, usage?.completionTokens || 0),
            duration: endTime - startTime
          };
          
          logger.debug('PROVIDER', 'Google usage calculated', {
            provider: 'google',
            model: this.config.model,
            usage: usageInfo
          });
          
          options.onComplete(fullText, usageInfo);
        }
      } else {
        // Use regular streaming for non-thinking models
        if (options.onResponseStart) {
          options.onResponseStart();
        }

        // Get the actual model name (remove our custom suffix)
        const actualModelName = this.config.model.replace('-non-thinking', '');
        
        const result = streamText({
          model: this.client(`models/${actualModelName}`),
          messages: aiMessages,
        });

        for await (const textPart of result.textStream) {
          fullText += textPart;
          if (options.onToken) {
            options.onToken(textPart);
          }
          yield textPart;
        }

        // Get final usage information from the result
        const finalResult = await result;
        const usage = await finalResult.usage;
        const endTime = Date.now();
        
        const logger = getLogger();
        
        // COMPREHENSIVE DEBUG: Examine ALL available objects and promises (non-thinking)
        logger.debug('PROVIDER', 'Complete finalResult object structure (non-thinking)', {
          provider: 'google',
          model: this.config.model,
          final_result_keys: Object.keys(finalResult),
          final_result_descriptors: Object.getOwnPropertyDescriptors(finalResult)
        });

        // Check all possible promises and objects that might contain token info
        const debugData: any = {
          provider: 'google',
          model: this.config.model,
          has_usage: !!usage,
          usage_raw: usage
        };

        // Check all available promises similar to thinking model
        try {
          const rawResponse = await finalResult.rawResponse;
          debugData.raw_response_keys = rawResponse ? Object.keys(rawResponse) : null;
          debugData.raw_response_usage = rawResponse?.usage || null;
          debugData.raw_response_usage_details = rawResponse?.usageMetadata || null;
          debugData.raw_response_candidates = rawResponse?.candidates || null;
        } catch (error) {
          debugData.raw_response_error = error instanceof Error ? error.message : String(error);
        }

        // Check any other properties for potential token info
        for (const key of Object.keys(finalResult)) {
          if (key.endsWith('Promise') || key.includes('usage') || key.includes('token') || key.includes('metadata')) {
            try {
              const value = await (finalResult as any)[key];
              debugData[`extra_${key}`] = value;
              debugData[`extra_${key}_keys`] = value && typeof value === 'object' ? Object.keys(value) : null;
            } catch (error) {
              debugData[`extra_${key}_error`] = error instanceof Error ? error.message : String(error);
            }
          }
        }

        logger.debug('PROVIDER', 'COMPREHENSIVE Google AI SDK analysis (non-thinking model)', debugData);
        
        if (options.onComplete) {
          const usageInfo: UsageInfo = {
            promptTokens: usage?.promptTokens || 0,
            completionTokens: usage?.completionTokens || 0,
            totalTokens: usage?.totalTokens || 0,
            cost: calculateCost(this.config.model, usage?.promptTokens || 0, usage?.completionTokens || 0),
            duration: endTime - startTime
          };
          logger.debug("PROVIDER", "Usage:", usageInfo)
          console.log("awdwad")
          
          options.onComplete(fullText, usageInfo);
        }
      }

    } catch (error) {
      const logger = getLogger();
      logger.error('PROVIDER', 'Google streaming error', {
        provider: 'google',
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
