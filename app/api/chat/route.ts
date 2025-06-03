import { NextRequest, NextResponse } from 'next/server';
import { ConversationManager } from '@/lib/services/conversationManager';
import { ContextManager } from '@/lib/services/contextManager';
import { createLogger } from '@/lib/utils/logger';

// Debug logging
const DEBUG = true;
const logger = createLogger(DEBUG);

// Fallback responses
const FALLBACK_RESPONSES = {
  error: "I'm having trouble processing your request right now. Please try again later."
};

export async function POST(req: NextRequest) {
  try {
    logger.debug('Starting chat request');
    const { messages, userId } = await req.json();
    logger.debug('Received messages:', messages?.length || 0);
    logger.debug('User ID:', userId);

    // Initialize the new conversation manager
    const conversationManager = new ConversationManager();
    
    // Process the conversation using the new architecture
    const response = await conversationManager.processMessage(messages, userId);

    logger.debug('Generated response with new architecture');
    return NextResponse.json(response);

  } catch (error: any) {
    logger.error('General API Error:', error);
    return NextResponse.json(
      {
        message: {
          role: 'assistant',
          content: FALLBACK_RESPONSES.error
        },
        functionResult: null,
        formattedResult: FALLBACK_RESPONSES.error,
        history: [],
        error: 'Internal server error',
        details: DEBUG ? {
          message: error.message || error.toString(),
          stack: error.stack
        } : undefined
      },
      { status: 500 }
    );
  }
}