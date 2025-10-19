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

export interface PollUpdateState {
  step: 'select_poll' | 'select_field' | 'update_title' | 'update_options' | 'update_category' | 'confirm_update';
  userId: string;
  pollId?: string;
  pollTitle?: string;
  field?: 'title' | 'options' | 'end_date' | 'category';
  currentOptions?: any[];
  newValue?: any;
  updateType?: 'added' | 'replaced';
}

export interface ChatResponse {
  message: ChatMessage;
  functionResult: any;
  formattedResult: string | null;
  history: ChatMessage[];
}

export type Intent = 
  | 'greeting'
  | 'create_poll'
  | 'create_poll_category'
  | 'create_poll_topic'
  | 'create_poll_options'
  | 'create_poll_confirm'
  | 'create_poll_restart'
  | 'continue_poll_creation'
  | 'list_polls'
  | 'list_recent_polls'
  | 'list_user_voted_polls'
  | 'list_my_polls'
  | 'vote'
  | 'get_poll_options'
  | 'suggest_options'
  | 'check_vote_status'
  | 'view_poll_results'
  | 'update_poll'
  | 'update_poll_select'
  | 'update_poll_field'
  | 'update_poll_title'
  | 'update_poll_options'
  | 'update_poll_confirm'
  | 'add_poll_options'
  | 'clarify_poll_options_intent'
  | 'delete_poll'
  | 'poll_analytics'
  | 'general'; 