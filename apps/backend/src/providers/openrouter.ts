import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { AIProvider, MessageContent, ProviderConfig, StreamTextOptions, UsageInfo } from "./types";
import { createOpenAI } from "@ai-sdk/openai";
import { getLogger } from "../utils/logger";
import { streamText } from "ai";
import { calculateCost } from "./pricing";
import { getProviderModels } from '../config/models';

export class OpenRouterProvider implements AIProvider {
  readonly name = 'openrouter';
  readonly models = getProviderModels('openrouter');

  private client: ReturnType<typeof createOpenAI>;
  private config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
    this.client = createOpenRouter({
      apiKey: config.apiKey,
    });
  }

  async *streamText(options: StreamTextOptions): AsyncIterable<string> {
    const startTime = Date.now();
    let fullText = '';
    const logger = getLogger();
    try {
      const aiMessages = options.messages.map(msg => {
        if (typeof msg.content === 'string') {
          return {
            role: msg.role,
            content: msg.content
          };
        } else {
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

      const result = streamText({
        model: this.client.chat(this.config.model),
        messages: aiMessages,
      })

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
      const endTime = Date.now();
      const usage = await result.usage;

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
    catch (error) {
      console.log(error);
    }
  }
}
