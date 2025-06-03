export interface ConversationContext {
  userId?: string;
  userProfile: UserProfile;
  conversationHistory: ChatMessage[];
  currentState?: ConversationState;
  sessionData: Record<string, any>;
  entities: Record<string, any>;
  lastIntent?: Intent;
}

export interface UserProfile {
  id?: string;
  role: 'user' | 'admin';
  preferences?: Record<string, any>;
}

export interface ConversationState {
  type: 'poll_creation' | 'poll_update' | 'voting' | 'idle';
  step?: string;
  data?: Record<string, any>;
  expiresAt?: Date;
}

export interface Intent {
  type: IntentType;
  confidence: number;
  entities: Record<string, any>;
  rawText: string;
  context?: Record<string, any>;
}

export type IntentType = 
  | 'greeting'
  | 'list_polls'
  | 'list_my_polls'
  | 'create_poll'
  | 'update_poll'
  | 'delete_poll'
  | 'vote'
  | 'view_results'
  | 'help'
  | 'general';

export interface FlowResult {
  success: boolean;
  data?: any;
  error?: string;
  nextStep?: string;
  shouldEndFlow?: boolean;
  contextUpdate?: Record<string, any>;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: Date;
  metadata?: Record<string, any>;
} 