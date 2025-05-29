export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
}

export interface PollCreationState {
  step: 'category' | 'topic' | 'options' | 'confirm';
  category?: string;
  topic?: string;
  title?: string;
  options?: string[];
  userId?: string;
  suggestedOptions?: string[];
}

export interface ChatResponse {
  message: ChatMessage;
  functionResult: any;
  formattedResult: string | null;
  history: ChatMessage[];
}

export type Intent = 
  | 'greeting'
  | 'list_polls'
  | 'list_recent_polls'
  | 'list_user_voted_polls'
  | 'get_poll_options'
  | 'vote'
  | 'create_poll'
  | 'create_poll_category'
  | 'create_poll_topic'
  | 'create_poll_options'
  | 'create_poll_confirm'
  | 'create_poll_restart'
  | 'suggest_options'
  | 'check_vote_status'
  | 'view_poll_results'
  | 'continue_poll_creation'
  | 'general'; 