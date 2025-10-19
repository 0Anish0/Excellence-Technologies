import { createClient } from '@supabase/supabase-js';
import { ConversationContext, ConversationState, UserProfile, Intent } from '../models/conversation';
import { ChatMessage } from '../models/conversation';
import { createLogger } from '../utils/logger';

const logger = createLogger(true);
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export class ContextManager {
  private contextCache = new Map<string, ConversationContext>();

  async updateContext(
    userId: string | undefined,
    userMessage: ChatMessage,
    conversationHistory: ChatMessage[],
    userProfile: UserProfile
  ): Promise<ConversationContext> {
    const context: ConversationContext = {
      userId,
      userProfile,
      conversationHistory,
      sessionData: {},
      entities: {}
    };

    if (userId) {
      // Load existing context
      const existingContext = await this.loadContext(userId);
      if (existingContext) {
        context.currentState = existingContext.currentState;
        context.sessionData = existingContext.sessionData;
        context.entities = existingContext.entities;
        context.lastIntent = existingContext.lastIntent;
      }

      // Cache the context
      this.contextCache.set(userId, context);
    }

    return context;
  }

  async updateLastIntent(userId: string | undefined, intent: Intent): Promise<void> {
    if (!userId) return;

    const context = this.contextCache.get(userId);
    if (context) {
      context.lastIntent = intent;
      this.contextCache.set(userId, context);
    }
  }

  async setState(
    userId: string | undefined, 
    state: ConversationState | null
  ): Promise<void> {
    if (!userId) return;

    const context = this.contextCache.get(userId);
    if (context) {
      context.currentState = state || undefined;
      this.contextCache.set(userId, context);
    }
  }

  async updateSessionData(
    userId: string | undefined, 
    data: Record<string, any>
  ): Promise<void> {
    if (!userId) return;

    const context = this.contextCache.get(userId);
    if (context) {
      context.sessionData = { ...context.sessionData, ...data };
      this.contextCache.set(userId, context);
    }
  }

  async addEntity(
    userId: string | undefined, 
    key: string, 
    value: any
  ): Promise<void> {
    if (!userId) return;

    const context = this.contextCache.get(userId);
    if (context) {
      context.entities[key] = value;
      this.contextCache.set(userId, context);
    }
  }

  getContext(userId: string | undefined): ConversationContext | undefined {
    if (!userId) return undefined;
    return this.contextCache.get(userId);
  }

  async saveContext(userId: string, context: ConversationContext): Promise<void> {
    try {
      const contextData = {
        user_id: userId,
        current_state: context.currentState,
        session_data: context.sessionData,
        entities: context.entities,
        last_intent: context.lastIntent,
        updated_at: new Date().toISOString()
      };

      await supabase
        .from('conversation_context')
        .upsert(contextData, { onConflict: 'user_id' });

    } catch (error) {
      logger.error('Error saving context:', error);
    }
  }

  private async loadContext(userId: string): Promise<ConversationContext | null> {
    try {
      const { data } = await supabase
        .from('conversation_context')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (!data) return null;

      return {
        userId,
        userProfile: { id: userId, role: 'user' }, // Will be updated
        conversationHistory: [],
        currentState: data.current_state,
        sessionData: data.session_data || {},
        entities: data.entities || {},
        lastIntent: data.last_intent
      };

    } catch (error) {
      logger.debug('No existing context found for user:', userId);
      return null;
    }
  }

  async clearContext(userId: string | undefined): Promise<void> {
    if (!userId) return;

    this.contextCache.delete(userId);
    
    try {
      await supabase
        .from('conversation_context')
        .delete()
        .eq('user_id', userId);
    } catch (error) {
      logger.error('Error clearing context:', error);
    }
  }

  // Helper methods for common state checks
  isInFlow(userId: string | undefined): boolean {
    const context = this.getContext(userId);
    return !!context?.currentState && context.currentState.type !== 'idle';
  }

  getCurrentFlow(userId: string | undefined): string | null {
    const context = this.getContext(userId);
    return context?.currentState?.type || null;
  }

  getCurrentStep(userId: string | undefined): string | null {
    const context = this.getContext(userId);
    return context?.currentState?.step || null;
  }
} 