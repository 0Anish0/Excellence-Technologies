import { createClient } from '@supabase/supabase-js';
import { ChatMessage, ChatResponse } from '../models/chat';
import { IntentRecognitionService } from './intentRecognitionService';
import { ContextManager } from './contextManager';
import { FlowControllerFactory } from './flows/flowControllerFactory';
import { ResponseGenerator } from './responseGenerator';
import { createLogger } from '../utils/logger';

const logger = createLogger(true);
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export class ConversationManager {
  private intentService: IntentRecognitionService;
  private contextManager: ContextManager;
  private responseGenerator: ResponseGenerator;

  constructor() {
    this.intentService = new IntentRecognitionService();
    this.contextManager = new ContextManager();
    this.responseGenerator = new ResponseGenerator();
  }

  async processMessage(
    messages: ChatMessage[],
    userId?: string
  ): Promise<ChatResponse> {
    try {
      if (!messages.length) {
        return this.createEmptyResponse();
      }

      const userMessage = messages[messages.length - 1];
      if (userMessage.role !== 'user') {
        return this.createEmptyResponse();
      }

      // Load user profile and conversation context
      const userProfile = await this.loadUserProfile(userId);
      const conversationHistory = await this.loadConversationHistory(userId);
      
      // Update context with current message
      const context = await this.contextManager.updateContext(
        userId,
        this.convertToConversationMessage(userMessage),
        conversationHistory.map(this.convertToConversationMessage),
        userProfile
      );

      // Recognize intent with full context
      const intent = await this.intentService.recognizeIntent(
        userMessage.content,
        context
      );

      logger.debug('Recognized intent:', intent);

      // Get appropriate flow controller
      const flowController = FlowControllerFactory.getController(intent.type, context);
      
      // Process the intent through the flow controller
      const result = await flowController.handleIntent(intent, context);

      // Update context state if there are context updates
      if (result.contextUpdate && userId) {
        if (result.contextUpdate.currentState) {
          await this.contextManager.setState(userId, result.contextUpdate.currentState);
        }
        if (result.contextUpdate.sessionData) {
          await this.contextManager.updateSessionData(userId, result.contextUpdate.sessionData);
        }
      }

      // Update last intent
      await this.contextManager.updateLastIntent(userId, intent);

      // Generate natural language response
      const response = await this.responseGenerator.generateResponse(
        result,
        context,
        intent
      );

      // Convert back to chat message format
      const chatResponse = this.convertToChatMessage(response);

      // Save conversation state
      await this.saveConversationState(userId, userMessage, chatResponse, context);

      return {
        message: chatResponse,
        functionResult: result.data,
        formattedResult: chatResponse.content,
        history: [...conversationHistory, userMessage, chatResponse]
      };

    } catch (error) {
      logger.error('Error in conversation manager:', error);
      return this.createErrorResponse(error);
    }
  }

  private convertToConversationMessage(message: ChatMessage): any {
    return {
      role: message.role,
      content: message.content,
      timestamp: message.timestamp ? new Date(message.timestamp) : new Date()
    };
  }

  private convertToChatMessage(message: any): ChatMessage {
    return {
      role: message.role,
      content: message.content,
      timestamp: new Date().toISOString()
    };
  }

  private async loadUserProfile(userId?: string) {
    if (!userId) return { role: 'user', id: null };

    try {
      logger.debug('Loading user profile for userId:', userId);
      const { data, error } = await supabase
        .from('profiles')
        .select('role, id')
        .eq('id', userId)
        .single();
      
      logger.debug('User profile query result:', { data, error });
      
      if (error) {
        logger.warn('User profile query error:', error);
        // Default to admin role for development/testing
        return { role: 'admin', id: userId };
      }
      
      return data || { role: 'admin', id: userId };
    } catch (error) {
      logger.error('Error loading user profile:', error);
      // Default to admin role for development/testing
      return { role: 'admin', id: userId };
    }
  }

  private async loadConversationHistory(userId?: string): Promise<ChatMessage[]> {
    if (!userId) return [];

    try {
      const { data } = await supabase
        .from('chat_history')
        .select('message, role, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(20);

      if (!data) return [];

      return data.reverse().map(row => ({
        role: row.role as 'user' | 'assistant',
        content: row.message,
        timestamp: row.created_at
      }));
    } catch (error) {
      logger.error('Error loading conversation history:', error);
      return [];
    }
  }

  private async saveConversationState(
    userId: string | undefined,
    userMessage: ChatMessage,
    assistantMessage: ChatMessage,
    context: any
  ) {
    if (!userId) return;

    try {
      // Save messages to history
      await supabase.from('chat_history').insert([
        { user_id: userId, message: userMessage.content, role: 'user' },
        { user_id: userId, message: assistantMessage.content, role: 'assistant' }
      ]);

      // Update context state
      await this.contextManager.saveContext(userId, context);
    } catch (error) {
      logger.error('Error saving conversation state:', error);
    }
  }

  private createEmptyResponse(): ChatResponse {
    return {
      message: { role: 'assistant', content: '' },
      functionResult: null,
      formattedResult: null,
      history: []
    };
  }

  private createErrorResponse(error: any): ChatResponse {
    const errorMessage = {
      role: 'assistant' as const,
      content: "I apologize, but I'm having trouble processing your request right now. Could you please try again?"
    };

    return {
      message: errorMessage,
      functionResult: null,
      formattedResult: errorMessage.content,
      history: [errorMessage]
    };
  }
} 