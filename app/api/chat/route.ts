import { NextRequest, NextResponse } from 'next/server';
import { processMessage } from '@/lib/services/chatService';
import { createLogger } from '@/lib/utils/chatUtils';

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

    const response = await processMessage(messages, userId);

    return NextResponse.json(response);

  } catch (error: any) {
    logger.error('General API Error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: FALLBACK_RESPONSES.error,
        details: DEBUG ? {
          message: error.message || error.toString(),
          stack: error.stack
        } : undefined
      },
      { status: 500 }
    );
  }
}