import { GoogleGenerativeAI } from '@google/generative-ai';
import { ChatMessage, FlowResult, Intent, ConversationContext } from '../models/conversation';
import { createLogger } from '../utils/logger';

const logger = createLogger(true);

export class ResponseGenerator {
  private genAI?: GoogleGenerativeAI;

  constructor() {
    if (process.env.GEMINI_API_KEY) {
      this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    }
  }

  async generateResponse(
    result: FlowResult,
    context: ConversationContext,
    intent: Intent
  ): Promise<ChatMessage> {
    try {
      // For simple cases, return the message directly
      if (result.data?.message && !this.shouldEnhanceResponse(result)) {
        return {
          role: 'assistant',
          content: result.data.message
        };
      }

      // Use AI to generate more natural responses for complex cases
      if (this.genAI && this.shouldUseAI(result)) {
        const enhancedResponse = await this.generateAIResponse(result, context, intent);
        if (enhancedResponse) {
          return {
            role: 'assistant',
            content: enhancedResponse
          };
        }
      }

      // Fallback to formatted response
      return {
        role: 'assistant',
        content: this.formatResponse(result, context)
      };

    } catch (error) {
      logger.error('Error generating response:', error);
      return this.createFallbackResponse(result);
    }
  }

  private shouldEnhanceResponse(result: FlowResult): boolean {
    return result.data?.type === 'update_preview' || 
           result.data?.type === 'poll_list' ||
           result.data?.type === 'field_selection';
  }

  private shouldUseAI(result: FlowResult): boolean {
    return this.shouldEnhanceResponse(result) && !!this.genAI;
  }

  private async generateAIResponse(
    result: FlowResult,
    context: ConversationContext,
    intent: Intent
  ): Promise<string | null> {
    try {
      const model = this.genAI!.getGenerativeModel({ model: 'gemini-1.5-pro' });
      
      const prompt = this.buildAIResponsePrompt(result, context, intent);
      const response = await model.generateContent(prompt);
      
      return response.response.text();
    } catch (error) {
      logger.error('AI response generation failed:', error);
      return null;
    }
  }

  private buildAIResponsePrompt(
    result: FlowResult,
    context: ConversationContext,
    intent: Intent
  ): string {
    return `You are PollBot, a friendly and helpful assistant for poll management.

CONTEXT:
- User role: ${context.userProfile.role}
- User intent: ${intent.type}
- User message: "${intent.rawText}"
- Current flow: ${context.currentState?.type || 'none'}

RESULT DATA:
${JSON.stringify(result.data, null, 2)}

INSTRUCTIONS:
1. Generate a natural, conversational response based on the result data
2. Be helpful, friendly, and clear
3. Use appropriate formatting (markdown, lists, etc.)
4. If there's a message in the data, enhance it to be more conversational
5. Maintain the bot's personality - helpful and enthusiastic about polls
6. Keep responses concise but informative

Generate a response that feels natural and helpful:`;
  }

  private formatResponse(result: FlowResult, context: ConversationContext): string {
    if (result.data?.message) {
      return result.data.message;
    }

    if (!result.success) {
      return result.error || "Something went wrong. Please try again.";
    }

    // Generic success response
    return "Got it! How else can I help you with polls today?";
  }

  private createFallbackResponse(result: FlowResult): ChatMessage {
    return {
      role: 'assistant',
      content: result.data?.message || 
               result.error || 
               "I'm here to help with polls! What would you like to do?"
    };
  }
} 