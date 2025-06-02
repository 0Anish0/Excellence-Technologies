import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { ChatMessage, PollCreationState, PollUpdateState, Intent, ChatResponse } from '../models/chat';
import { detectIntent, detectCategory, createLogger } from '../utils/chatUtils';
import { prompts } from '../prompts';

// Configuration
const DEBUG = true;
const logger = createLogger(DEBUG);
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 60;

// Rate limit handling
let requestCount = 0;
let windowStart = Date.now();

// Queue system
const messageQueue: Array<{
  prompt: string;
  resolve: (value: string) => void;
  reject: (error: any) => void;
}> = [];

let isProcessing = false;

// Fallback responses
const FALLBACK_RESPONSES = {
  rateLimit: "I'm currently handling a lot of requests. Please try again in a few moments.",
  error: "I'm having trouble processing your request right now. Please try again later.",
  generic: "I'm here to help with polls and voting! You can ask me to show polls, vote on a poll, create a new poll (if you're an admin), or suggest options for a poll."
};

// Initialize clients
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Poll creation and update state management
const pollCreationStates = new Map<string, PollCreationState>();
const pollUpdateStates = new Map<string, PollUpdateState>();

/**
 * Process the AI message queue
 */
async function processQueue() {
  if (isProcessing || messageQueue.length === 0) return;

  isProcessing = true;
  const { prompt, resolve, reject } = messageQueue.shift()!;

  try {
    // Check rate limits
    const now = Date.now();
    if (now - windowStart >= RATE_LIMIT_WINDOW) {
      requestCount = 0;
      windowStart = now;
    }

    if (requestCount >= MAX_REQUESTS_PER_WINDOW) {
      throw new Error('RATE_LIMIT_EXCEEDED');
    }

    requestCount++;
    logger.debug('Processing queue item, current request count:', requestCount);

    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is not configured');
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });
    logger.debug('Model initialized, generating content');

    try {
      const result = await model.generateContent(prompt);
      logger.debug('Received response from Gemini');

      if (!result.response) {
        throw new Error('No response from Gemini API');
      }

      const text = result.response.text();
      logger.debug('Successfully processed message');
      resolve(text);
    } catch (error: any) {
      if (error.message?.includes('429 Too Many Requests')) {
        const quotaError = {
          status: 429,
          message: "I'm currently experiencing high demand. Please try again in a minute.",
          details: error.message
        };
        logger.debug('Quota limit exceeded:', quotaError);
        reject(quotaError);
      } else {
        throw error;
      }
    }
  } catch (error: any) {
    logger.debug('Error in processQueue:', error);

    if (error.status === 429) {
      reject(error);
    } else if (error.message === 'RATE_LIMIT_EXCEEDED') {
      reject({ status: 429, message: FALLBACK_RESPONSES.rateLimit });
    } else if (error.message === 'GEMINI_API_KEY is not configured') {
      reject({ status: 500, message: 'Chat service is not properly configured. Please contact support.' });
    } else {
      reject({
        status: 500,
        message: FALLBACK_RESPONSES.error,
        details: DEBUG ? error.message : undefined
      });
    }
  } finally {
    isProcessing = false;
    if (messageQueue.length > 0) {
      processQueue();
    }
  }
}

/**
 * Get or create a poll creation state for a user
 */
export function getPollCreationState(userId: string): PollCreationState | undefined {
  return pollCreationStates.get(userId);
}

/**
 * Set a poll creation state for a user
 */
export function setPollCreationState(userId: string, state: PollCreationState | null): void {
  if (state === null) {
    pollCreationStates.delete(userId);
  } else {
    pollCreationStates.set(userId, state);
  }
}

/**
 * Get or create a poll update state for a user
 */
export function getPollUpdateState(userId: string): PollUpdateState | undefined {
  return pollUpdateStates.get(userId);
}

/**
 * Set a poll update state for a user
 */
export function setPollUpdateState(userId: string, state: PollUpdateState | null): void {
  if (state === null) {
    pollUpdateStates.delete(userId);
  } else {
    pollUpdateStates.set(userId, state);
  }
}

/**
 * Load chat history for a user
 */
export async function loadChatHistory(userId: string): Promise<ChatMessage[]> {
  if (!userId) return [];
  
  try {
    logger.debug('Loading chat history for user:', userId);
    
    // Get the most recent messages
    const { data: chatRows, error: historyError } = await supabase
      .from('chat_history')
      .select('id, message, role, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (historyError) {
      logger.error('Error loading chat history:', historyError);
      return [];
    }
    
    if (chatRows && chatRows.length > 0) {
      // Reverse to get chronological order
      return chatRows.reverse().map((row: any) => {
        // Ensure role is either 'user' or 'assistant'
        const role = row.role === 'user' ? 'user' : 'assistant';
        return { 
          role, 
          content: row.message 
        };
      });
    }
    
    logger.debug('No chat history found for user');
    return [];
  } catch (err) {
    logger.error('Unexpected error loading chat history:', err);
    return [];
  }
}

/**
 * Save a message to chat history
 */
export async function saveMessageToHistory(userId: string, message: ChatMessage): Promise<void> {
  if (!userId) return;
  
  try {
    await supabase.from('chat_history').insert([
      { user_id: userId, message: message.content, role: message.role }
    ]);
  } catch (error) {
    logger.error('Error saving message to history:', error);
  }
}

/**
 * Handle specific intents based on user message
 */
export async function handleIntent(
  intent: Intent,
  message: string,
  userId: string | undefined,
  userRole: string,
  history: ChatMessage[]
): Promise<{ formattedResult: string | null; functionResult: any }> {
  logger.debug('Handling intent:', intent);
  
  // Get current poll creation state if it exists
  const currentState = userId ? getPollCreationState(userId) : undefined;
  const currentUpdateState = userId ? getPollUpdateState(userId) : undefined;
  
  // Check for state reset keywords
  const msg = message.toLowerCase().trim();
  const resetKeywords = [
    'cancel', 'stop', 'exit', 'quit', 'restart', 'start over', 'clear', 'reset',
    'help', 'start fresh', 'new conversation', 'begin again', 'abort'
  ];
  
  const shouldResetState = resetKeywords.some(keyword => msg.includes(keyword));
  
  // Clear states if user wants to reset or if they're trying to do something completely different
  const isStateBreaking = intent === 'greeting' || intent === 'list_polls' || intent === 'list_user_voted_polls' || 
                          intent === 'update_poll' || intent === 'create_poll' || intent === 'list_my_polls' ||
                          intent === 'poll_analytics' || intent === 'delete_poll' || shouldResetState;
  
  if (isStateBreaking && userId) {
    // Clear any existing states when user wants to do something different
    if ((currentState && intent !== 'create_poll_category' && intent !== 'create_poll_topic' && 
         intent !== 'create_poll_options' && intent !== 'create_poll_confirm' && intent !== 'continue_poll_creation') ||
        (currentUpdateState && !intent.startsWith('update_poll')) ||
        shouldResetState) {
      setPollCreationState(userId, null);
      setPollUpdateState(userId, null);
      logger.debug('Cleared poll states due to state-breaking intent or reset request');
    }
  }
  
  switch (intent) {
    case 'greeting':
      return {
        formattedResult: `Hi! I'm PollBot, your friendly assistant for polls and voting! 🗳️\n\nI can help you with:\n• Viewing available polls\n• Voting on polls\n• Checking your voting status\n${userRole === 'admin' ? '• Creating new polls\n• Editing polls' : ''}\n\nWhat would you like to do today?`,
        functionResult: null
      };
      
    case 'list_polls':
      const { data: pollsData } = await supabase
        .from('polls')
        .select('id, title, category, end_date, status')
        .order('end_date', { ascending: true });

      return {
        formattedResult: pollsData && pollsData.length > 0 
          ? 'Here are the available polls:\n' + pollsData.map(
              (poll: any, idx: number) =>
                `${idx + 1}. ${poll.title}\n   Poll ID: ${poll.id}\n   Category: ${poll.category}\n   Ends: ${new Date(poll.end_date).toLocaleString()}\n   Status: ${poll.status}`
            ).join('\n\n')
          : 'There are no polls available right now. Check back later or ask an admin to create some polls!',
        functionResult: pollsData
      };
      
    case 'list_recent_polls':
      // Extract number of polls to show from message
      const numMatch = message.match(/\b(\d+)\b/);
      const limit = numMatch ? parseInt(numMatch[1], 10) : 3; // Default to 3 if no number specified
      
      const { data: recentPollsData } = await supabase
        .from('polls')
        .select('id, title, category, end_date, status')
        .order('created_at', { ascending: false })
        .limit(limit);

      return {
        formattedResult: recentPollsData && recentPollsData.length > 0 
          ? `Here are the ${limit} most recent polls:\n` + recentPollsData.map(
              (poll: any, idx: number) =>
                `${idx + 1}. ${poll.title}\n   Poll ID: ${poll.id}\n   Category: ${poll.category}\n   Ends: ${new Date(poll.end_date).toLocaleString()}\n   Status: ${poll.status}`
            ).join('\n\n')
          : 'There are no recent polls available right now.',
        functionResult: recentPollsData
      };
      
    case 'list_user_voted_polls':
      if (!userId) {
        return {
          formattedResult: 'Please log in to see polls you have voted on.',
          functionResult: null
        };
      }
      
      // Extract number of polls to show from message
      const votedNumMatch = message.match(/\b(\d+)\b/);
      const votedLimit = votedNumMatch ? parseInt(votedNumMatch[1], 10) : 5; // Default to 5 if no number specified
      
      const { data: userVotes } = await supabase
        .from('votes')
        .select('poll_id, created_at, polls(id, title, category, end_date, status)')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(votedLimit);

      if (!userVotes || userVotes.length === 0) {
        return {
          formattedResult: "You haven't voted in any polls yet. Would you like to see the available polls?",
          functionResult: null
        };
      }
      
      return {
        formattedResult: `Here are the ${Math.min(votedLimit, userVotes.length)} most recent polls you've voted on:\n` + 
          userVotes.map((vote: any, idx: number) => {
            const poll = vote.polls;
            return `${idx + 1}. ${poll.title}\n   Poll ID: ${poll.id}\n   Category: ${poll.category}\n   Ends: ${new Date(poll.end_date).toLocaleString()}\n   Status: ${poll.status}\n   Voted on: ${new Date(vote.created_at).toLocaleString()}`;
          }).join('\n\n'),
        functionResult: userVotes
      };
      
    case 'create_poll':
      if (userRole !== 'admin') {
        return {
          formattedResult: 'Sorry, only admin users can create polls. If you need a new poll created, please contact an administrator.',
          functionResult: null
        };
      } else if (userId) {
        // First check for specific domain keywords
        let impliedCategory: string | null = null;
        const msgLower = message.toLowerCase();
        
        // Check for transportation/railway terms
        if (msgLower.includes('railway') || 
            msgLower.includes('train') || 
            msgLower.includes('irctc') || 
            msgLower.includes('indian railway') || 
            msgLower.includes('transport')) {
          impliedCategory = 'Other';
          logger.debug('Railway/transportation detected, setting category to Other');
        }
        // Check for real estate terms
        else if (msgLower.includes('real estate') || 
            msgLower.includes('realestate') || 
            msgLower.includes('property') ||
            msgLower.includes('housing') ||
            msgLower.includes('apartment') ||
            msgLower.includes('land')) {
          impliedCategory = 'Other';
          logger.debug('Real estate detected in create_poll, setting category to Other');
        }
        // Check for other categories using the enhanced detection
        else {
          impliedCategory = detectCategory(message);
        }
        
        if (impliedCategory) {
          // If category is already implied, set it and go straight to topic
          const newState: PollCreationState = { 
            step: 'topic', 
            userId,
            category: impliedCategory
          };
          setPollCreationState(userId, newState);
          return {
            formattedResult: `Great! I've set the category to "${impliedCategory}" based on your message. Now, please provide the main topic or question for your poll.`,
            functionResult: null
          };
        } else {
          // No implied category, ask normally
          const newState: PollCreationState = { step: 'category', userId };
          setPollCreationState(userId, newState);
          return {
            formattedResult: 'Great! Let\'s create a new poll together. First, please choose a category for your poll:\n\n• Politics\n• Technology\n• Entertainment\n• Other\n\nOr just tell me what your poll is about, and I\'ll try to categorize it automatically.',
            functionResult: null
          };
        }
      } else {
        return {
          formattedResult: 'Please log in to create a poll.',
          functionResult: null
        };
      }
      
    case 'create_poll_category':
      if (userRole !== 'admin' || !userId) {
        return {
          formattedResult: 'Sorry, only admin users can create polls. If you need a new poll created, please contact an administrator.',
          functionResult: null
        };
      }

      // Extract category from message or use AI detection
      let categoryText = message.trim();
      const categoryMatch = categoryText.match(/category:\s*(\w+)/i);
      
      if (categoryMatch && categoryMatch[1]) {
        categoryText = categoryMatch[1];
      }
      
      // Check for real estate specific terms
      let category: string | null = null;
      if (categoryText.toLowerCase().includes('real estate') || 
          categoryText.toLowerCase().includes('realestate') || 
          categoryText.toLowerCase().includes('property') ||
          categoryText.toLowerCase().includes('housing') ||
          categoryText.toLowerCase().includes('apartment') ||
          categoryText.toLowerCase().includes('land')) {
        category = 'Other';
        logger.debug('Real estate detected, setting category to Other');
      } else {
        // Try smart category detection
        category = detectCategory(categoryText);
      }
      
      if (!category) {
        // If not detected automatically, try AI-based categorization
        try {
          const categoryPromptText = prompts.categoryPrompt(categoryText);
          const aiCategoryResponse = await new Promise<string>((resolve, reject) => {
            messageQueue.push({ prompt: categoryPromptText, resolve, reject });
            processQueue();
          });
          
          // Sanitize and validate the AI response
          const normalizedResponse = aiCategoryResponse.trim();
          const validCategories = ['Technology', 'Politics', 'Entertainment', 'Other'];
          
          if (validCategories.some(c => normalizedResponse.toLowerCase().includes(c.toLowerCase()))) {
            for (const c of validCategories) {
              if (normalizedResponse.toLowerCase().includes(c.toLowerCase())) {
                category = c;
                break;
              }
            }
          }
        } catch (error) {
          logger.error('Error in AI category detection:', error);
          // Fall back to Other if AI fails
          category = 'Other';
        }
        
        // If still no category detected, default to Other
        if (!category) {
          category = 'Other';
          logger.debug('No category detected, defaulting to Other for input:', categoryText);
        }
      }
      
      if (category) {
        const state: PollCreationState = getPollCreationState(userId) || { step: 'category', userId };
        state.category = category;
        state.step = 'topic';
        setPollCreationState(userId, state);

        return {
          formattedResult: `Great! Category set to "${category}". Now, please provide the main topic or question for your poll.`,
          functionResult: null
        };
      } else {
        return {
          formattedResult: 'I couldn\'t determine a category from your message. Please select one: Politics, Technology, Entertainment, or Other.',
          functionResult: null
        };
      }
      
    case 'create_poll_topic':
      if (userRole !== 'admin' || !userId) {
        return {
          formattedResult: 'Sorry, only admin users can create polls. If you need a new poll created, please contact an administrator.',
          functionResult: null
        };
      }

      const state = getPollCreationState(userId);
      if (!state) {
        return {
          formattedResult: 'Let\'s start over. Please choose a category for your poll:\n\n• Politics\n• Technology\n• Entertainment\n• Other',
          functionResult: null
        };
      }

      // Extract topic from message - handle any natural language input
      let topicText = message.trim();
      
      // Check for explicit topic/question marker
      const topicMatch = topicText.match(/topic:|question:\s*(.+)/i);
      if (topicMatch && topicMatch[1]) {
        topicText = topicMatch[1].trim();
      }

      // Basic validation
      if (topicText.length < 10) {
        return {
          formattedResult: 'Your poll question is a bit short. Could you provide a more detailed topic or question (at least 10 characters)?',
          functionResult: null
        };
      }

      // Format the title (shortened version if needed)
      const title = topicText.length > 60 ? topicText.substring(0, 57) + '...' : topicText;
      
      // Update state
      state.topic = topicText;
      state.title = title;
      state.step = 'options';
      setPollCreationState(userId, state);

      // Provide enthusiastic feedback
      const responses = [
        `Perfect! "${title}" makes a great poll question.`,
        `Great question! "${title}" will make an interesting poll.`,
        `Excellent! I've set your poll question to "${title}".`
      ];
      
      const randomResponse = responses[Math.floor(Math.random() * responses.length)];
      
      return {
        formattedResult: `${randomResponse} Now, let's create some options for people to vote on. Please provide a few options separated by commas.`,
        functionResult: null
      };
      
    case 'create_poll_options':
      if (userRole !== 'admin' || !userId) {
        return {
          formattedResult: 'Sorry, only admin users can create polls. If you need a new poll created, please contact an administrator.',
          functionResult: null
        };
      }

      const optionsState = getPollCreationState(userId);
      if (!optionsState) {
        return {
          formattedResult: 'Let\'s start over. Please choose a category for your poll:\n\n• Politics\n• Technology\n• Entertainment\n• Other',
          functionResult: null
        };
      }

      // Process options from message - handle different input formats
      let optionsText = message.trim();
      
      // Check for explicit options marker
      const optionsMatch = optionsText.match(/options:\s*(.+)/i);
      if (optionsMatch && optionsMatch[1]) {
        optionsText = optionsMatch[1].trim();
      }
      
      // Check if user is asking for suggestions
      if (optionsText.match(/\b(suggest|give|help|ideas?|recommend)\b.*\b(options?|choices?)\b/i)) {
        return {
          formattedResult: `I'd be happy to suggest some options for your "${optionsState.topic}" poll. What kind of options would you like me to suggest?`,
          functionResult: null
        };
      }
      
      let options = [];
      
      // Check if user is selecting from suggested options (numbers separated by commas)
      if (optionsState.suggestedOptions && optionsState.suggestedOptions.length > 0 && 
          optionsText.match(/^\s*\d+(\s*,\s*\d+)*\s*$/)) {
        // Parse selected option numbers
        const selectedNumbers = optionsText.split(',').map(n => parseInt(n.trim(), 10));
        
        // Map selected numbers to suggested options (adjusting for 0-based array vs 1-based numbering)
        options = selectedNumbers
          .filter(n => n > 0 && n <= optionsState.suggestedOptions!.length)
          .map(n => optionsState.suggestedOptions![n - 1]);
          
        // If no valid options were selected, provide helpful feedback
        if (options.length === 0) {
          return {
            formattedResult: `I couldn't find any valid options from your selection. Please provide numbers between 1 and ${optionsState.suggestedOptions.length}, separated by commas.`,
            functionResult: null
          };
        }
        
        logger.debug('Selected options from suggestions:', options);
      } else {
        // Regular option extraction logic
        // Extract options - handle comma-separated, asterisk-separated, and line-separated formats
        if (optionsText.includes(',')) {
          // Handle comma-separated format
          options = optionsText.split(',').map(opt => opt.trim()).filter(opt => opt.length > 0);
        } else if (optionsText.includes('*')) {
          // Handle asterisk-separated format
          options = optionsText.split('*').map(opt => opt.trim()).filter(opt => opt.length > 0);
        } else if (optionsText.includes('\n')) {
          // Handle line-separated format
          options = optionsText.split('\n').map(opt => opt.trim()).filter(opt => opt.length > 0);
        } else {
          // Handle space-separated (for very short options)
          options = [optionsText.trim()];
        }
      }

      // If we didn't get enough options, give helpful feedback
      if (options.length < 2) {
        // If user provided just one option, acknowledge it and ask for more
        if (options.length === 1) {
          return {
            formattedResult: `I've got "${options[0]}" as your first option. Please provide at least one more option for your poll, separated by commas. For example: "${options[0]}, Another option, A third option"`,
            functionResult: null
          };
        }
        return {
          formattedResult: 'Please provide at least 2 options for your poll, separated by commas. For example: "Option 1, Option 2, Option 3"',
          functionResult: null
        };
      }

      // Check for duplicate options
      const uniqueOptions = Array.from(new Set(options));
      if (uniqueOptions.length !== options.length) {
        return {
          formattedResult: 'I noticed some duplicate options. Please make sure each option is unique.',
          functionResult: null
        };
      }

      // Update state
      optionsState.options = options;
      optionsState.step = 'confirm';
      setPollCreationState(userId, optionsState);

      // Provide summary and ask for confirmation
      return {
        formattedResult: `Here's a summary of your poll:\n\n` +
          `**Category:** ${optionsState.category}\n` +
          `**Title:** ${optionsState.title}\n` +
          `**Question:** ${optionsState.topic}\n\n` +
          `**Options:**\n${options.map((opt: string, i: number) => `${i + 1}. ${opt}`).join('\n')}\n\n` +
          `Does this look good? Reply with "confirm" to create this poll, "edit" to make changes, or "cancel" to start over.`,
        functionResult: null
      };
    
    case 'create_poll_confirm':
      if (userRole !== 'admin' || !userId) {
        return {
          formattedResult: 'Sorry, only admin users can create polls. If you need a new poll created, please contact an administrator.',
          functionResult: null
        };
      }

      const confirmState = getPollCreationState(userId);
      if (!confirmState || confirmState.step !== 'confirm') {
        return {
          formattedResult: 'Let\'s start over. Please choose a category for your poll:\n\n• Politics\n• Technology\n• Entertainment\n• Other',
          functionResult: null
        };
      }

      if (message.toLowerCase().includes('cancel')) {
        setPollCreationState(userId, null);
        return {
          formattedResult: 'Poll creation cancelled. How else can I help you today?',
          functionResult: null
        };
      }

      if (message.toLowerCase().includes('edit')) {
        confirmState.step = 'category';
        setPollCreationState(userId, confirmState);
        return {
          formattedResult: 'Let\'s edit your poll. Please choose a category again:\n\n• Politics\n• Technology\n• Entertainment\n• Other',
          functionResult: null
        };
      }

      // Handle natural language confirmations
      const createConfirmPatterns = [
        'confirm', 'yes', 'yeah', 'yep', 'sure', 'ok', 'okay', 'go ahead', 
        'sounds good', 'looks good', 'that works', 'proceed', 'create', 'do it',
        'create the poll', 'save', 'save it', 'submit', 'create poll'
      ];
      
      const createIsConfirming = createConfirmPatterns.some(pattern => 
        message.toLowerCase().includes(pattern)
      ) || message === 'options' || message.match(/^options:\s/i);

      if (createIsConfirming) {
        try {
          const pollDataToInsert = {
            user_id: userId,
            title: confirmState.title || confirmState.topic,
            question: confirmState.topic,
            category: confirmState.category,
            end_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 1 week from now
            status: 'active',
          };

          logger.debug('Creating poll with data:', pollDataToInsert);

          const { data: pollData, error: pollError } = await supabase
            .from('polls')
            .insert(pollDataToInsert)
            .select('*')
            .single();

          if (pollError) {
            logger.error('Error creating poll:', pollError);
            throw new Error(`Failed to create poll: ${pollError.message}`);
          }

          if (!pollData || !pollData.id) {
            throw new Error('Failed to get poll ID after creation');
          }

          // Add poll options
          if (confirmState.options && confirmState.options.length > 0) {
            const optionsToInsert = confirmState.options.map((option, index) => ({
              poll_id: pollData.id,
              text: option,
              position: index + 1,
            }));

            const { error: optionsError } = await supabase
              .from('poll_options')
              .insert(optionsToInsert);

            if (optionsError) {
              logger.error('Error creating poll options:', optionsError);
              await supabase.from('polls').delete().eq('id', pollData.id);
              throw new Error(`Failed to create poll options: ${optionsError.message}`);
            }
          }

          // Clear the poll creation state
          setPollCreationState(userId, null);

          return {
            formattedResult: `🎉 Poll created successfully!\n\n` +
              `**Title:** ${pollData.title}\n` +
              `**ID:** ${pollData.id}\n` +
              `**Category:** ${pollData.category}\n` +
              `**End Date:** ${new Date(pollData.end_date).toLocaleString()}\n\n` +
              `Users can now vote on this poll. You can view all polls by saying "show polls" or view results by saying "show results for poll ${pollData.id}".`,
            functionResult: { success: true, pollId: pollData.id }
          };
        } catch (error: any) {
          logger.error('Error in poll creation:', error);
          return {
            formattedResult: `Sorry, there was an error creating your poll: ${error.message}. Please try again.`,
            functionResult: null
          };
        }
      } else {
        return {
          formattedResult: 'To create your poll, please confirm by replying with "confirm" or just say "yes".',
          functionResult: null
        };
      }
      
    case 'suggest_options':
      if (userRole !== 'admin' || !userId) {
        return {
          formattedResult: 'Sorry, only admin users can create polls and request option suggestions.',
          functionResult: null
        };
      }

      const suggestState = getPollCreationState(userId);
      if (!suggestState || !suggestState.topic) {
        return {
          formattedResult: 'Please specify a poll topic first. Start by saying "create a poll" and follow the steps.',
          functionResult: null
        };
      }

      try {
        const suggestionPrompt = prompts.optionSuggestionPrompt(suggestState.topic);
        
        const suggestedOptions = await new Promise<string>((resolve, reject) => {
          messageQueue.push({ prompt: suggestionPrompt, resolve, reject });
          processQueue();
        });

        suggestState.suggestedOptions = suggestedOptions.split('\n')
          .map(opt => opt.replace(/^\d+\.\s*/, '').trim())
          .filter(opt => opt.length > 0);
          
        setPollCreationState(userId, suggestState);

        return {
          formattedResult: `Here are some suggested options for your poll "${suggestState.title}":\n\n${suggestedOptions}\n\nPlease select options by replying with their numbers (e.g., "1, 2, 3") or provide your own with "options: [option1, option2, ...]".`,
          functionResult: null
        };
      } catch (error) {
        logger.error('Error generating suggestions:', error);
        return {
          formattedResult: 'Sorry, I couldn\'t generate suggestions right now. Please provide your own options with "options: [option1, option2, ...]".',
          functionResult: null
        };
      }

    case 'update_poll':
      if (userRole !== 'admin' || !userId) {
        return {
          formattedResult: 'Sorry, only admin users can update polls. If you need a poll updated, please contact an administrator.',
          functionResult: null
        };
      }

      // Check if user is already in update flow
      const existingUpdateState = getPollUpdateState(userId);
      if (existingUpdateState) {
        return {
          formattedResult: 'You\'re already updating a poll. Please finish the current update or say "cancel update" to start over.',
          functionResult: null
        };
      }

      // Get user's polls
      const { data: userPolls } = await supabase
        .from('polls')
        .select('id, title, category, status, end_date')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (!userPolls || userPolls.length === 0) {
        return {
          formattedResult: 'You don\'t have any polls to update. Would you like to create a new poll instead?',
          functionResult: null
        };
      }

      // Initialize update state
      const updateState: PollUpdateState = {
        step: 'select_poll',
        userId
      };
      setPollUpdateState(userId, updateState);

      return {
        formattedResult: `Here are your polls that you can update:\n\n` +
          userPolls.map((poll: any, idx: number) =>
            `${idx + 1}. ${poll.title}\n   ID: ${poll.id}\n   Category: ${poll.category}\n   Status: ${poll.status}\n   Ends: ${new Date(poll.end_date).toLocaleString()}`
          ).join('\n\n') +
          '\n\nPlease reply with the number or ID of the poll you want to update.',
        functionResult: userPolls
      };

    case 'update_poll_select':
      if (userRole !== 'admin' || !userId) {
        return {
          formattedResult: 'Sorry, only admin users can update polls.',
          functionResult: null
        };
      }

      const selectState = getPollUpdateState(userId);
      if (!selectState || selectState.step !== 'select_poll') {
        return {
          formattedResult: 'Please start the update process by saying "update poll".',
          functionResult: null
        };
      }

      // Parse poll selection from message
      let pollId: string | null = null;
      const numberMatch = message.match(/^\s*(\d+)\s*$/);
      const idMatch = message.match(/\b([a-f0-9-]{36})\b/i);

      if (numberMatch) {
        // User selected by number, get their polls again
        const { data: userPolls } = await supabase
          .from('polls')
          .select('id, title, category, status, end_date')
          .eq('user_id', userId)
          .order('created_at', { ascending: false });

        const pollIndex = parseInt(numberMatch[1], 10) - 1;
        if (userPolls && pollIndex >= 0 && pollIndex < userPolls.length) {
          pollId = userPolls[pollIndex].id;
        }
      } else if (idMatch) {
        // User provided poll ID directly
        pollId = idMatch[1];
      }

      if (!pollId) {
        return {
          formattedResult: 'Please provide a valid poll number or ID. Say "update poll" to see your polls again.',
          functionResult: null
        };
      }

      // Verify user owns this poll
      const { data: pollData } = await supabase
        .from('polls')
        .select('id, title, category, status, end_date')
        .eq('id', pollId)
        .eq('user_id', userId)
        .single();

      if (!pollData) {
        return {
          formattedResult: 'Poll not found or you don\'t have permission to update it. Please try again.',
          functionResult: null
        };
      }

      // Update state
      selectState.pollId = pollId;
      selectState.pollTitle = pollData.title;
      selectState.step = 'select_field';
      setPollUpdateState(userId, selectState);

      return {
        formattedResult: `Great! You selected "${pollData.title}". What would you like to update?\n\n` +
          '1. Title/Question\n' +
          '2. Options\n' +
          '3. End Date\n' +
          '4. Category\n\n' +
          'Please reply with the number or field name (e.g., "1", "title", "options").',
        functionResult: pollData
      };

    case 'update_poll_field':
      if (userRole !== 'admin' || !userId) {
        return {
          formattedResult: 'Sorry, only admin users can update polls.',
          functionResult: null
        };
      }

      const fieldState = getPollUpdateState(userId);
      if (!fieldState || fieldState.step !== 'select_field') {
        return {
          formattedResult: 'Please start the update process by saying "update poll".',
          functionResult: null
        };
      }

      // Parse field selection
      let field: 'title' | 'options' | 'end_date' | 'category' | null = null;
      const fieldMsg = message.toLowerCase().trim();

      if (fieldMsg === '1' || fieldMsg.includes('title') || fieldMsg.includes('question')) {
        field = 'title';
      } else if (fieldMsg === '2' || fieldMsg.includes('option')) {
        field = 'options';
      } else if (fieldMsg === '3' || fieldMsg.includes('end') || fieldMsg.includes('date')) {
        field = 'end_date';
      } else if (fieldMsg === '4' || fieldMsg.includes('category')) {
        field = 'category';
      }

      if (!field) {
        return {
          formattedResult: 'Please select a valid field to update:\n1. Title/Question\n2. Options\n3. End Date\n4. Category',
          functionResult: null
        };
      }

      fieldState.field = field;
      
      if (field === 'title') {
        fieldState.step = 'update_title';
        return {
          formattedResult: `Please provide the new title/question for your poll "${fieldState.pollTitle}":`,
          functionResult: null
        };
      } else if (field === 'options') {
        // Get current options
        const { data: currentOptions } = await supabase
          .from('poll_options')
          .select('id, text, position')
          .eq('poll_id', fieldState.pollId)
          .order('position');

        fieldState.currentOptions = currentOptions || [];
        fieldState.step = 'update_options';
        
        return {
          formattedResult: `Current options for "${fieldState.pollTitle}":\n\n` +
            (currentOptions?.map((opt: any, idx: number) => `${idx + 1}. ${opt.text}`).join('\n') || 'No options found') +
            '\n\nPlease provide the new options separated by commas, or tell me which specific options to update.',
          functionResult: currentOptions
        };
      } else if (field === 'end_date') {
        fieldState.step = 'confirm_update';
        const newEndDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 1 week from now
        fieldState.newValue = newEndDate.toISOString();
        
        return {
          formattedResult: `I'll extend the poll end date to ${newEndDate.toLocaleString()}. Is this okay? Reply "confirm" to proceed or "cancel" to stop.`,
          functionResult: null
        };
      } else if (field === 'category') {
        return {
          formattedResult: 'Please select a new category:\n• Politics\n• Technology\n• Entertainment\n• Other',
          functionResult: null
        };
      }

      setPollUpdateState(userId, fieldState);
      return {
        formattedResult: 'Field selection processed.',
        functionResult: null
      };

    case 'update_poll_title':
      if (userRole !== 'admin' || !userId) {
        return {
          formattedResult: 'Sorry, only admin users can update polls.',
          functionResult: null
        };
      }

      const titleState = getPollUpdateState(userId);
      if (!titleState || titleState.step !== 'update_title') {
        return {
          formattedResult: 'Please start the update process by saying "update poll".',
          functionResult: null
        };
      }

      const newTitle = message.trim();
      if (newTitle.length < 10) {
        return {
          formattedResult: 'The new title should be at least 10 characters long. Please provide a more detailed title.',
          functionResult: null
        };
      }

      titleState.newValue = newTitle;
      titleState.step = 'confirm_update';
      setPollUpdateState(userId, titleState);

      return {
        formattedResult: `You want to update the title from "${titleState.pollTitle}" to "${newTitle}". Is this correct? Reply "confirm" to proceed or "cancel" to stop.`,
        functionResult: null
      };

    case 'update_poll_options':
      if (userRole !== 'admin' || !userId) {
        return {
          formattedResult: 'Sorry, only admin users can update polls.',
          functionResult: null
        };
      }

      const optionsUpdateState = getPollUpdateState(userId);
      if (!optionsUpdateState || optionsUpdateState.step !== 'update_options') {
        return {
          formattedResult: 'Please start the update process by saying "update poll".',
          functionResult: null
        };
      }

      const userMsg = message.toLowerCase().trim();
      
      // First, check if user is clarifying their intent (like the example case)
      if (userMsg.includes('no') && (
          userMsg.includes('add') || 
          userMsg.includes('include') || 
          userMsg.includes('with the old') ||
          userMsg.includes('keep existing') ||
          userMsg.includes('not remove') ||
          userMsg.includes('plus') ||
          userMsg.includes('also')
        )) {
        // User wants to ADD to existing options, not replace
        try {
          const clarifyPrompt = prompts.pollUpdatePrompt('clarify_options_intent', {
            title: optionsUpdateState.pollTitle,
            currentOptions: optionsUpdateState.currentOptions
          }, message);
          
          const aiResponse = await new Promise<string>((resolve, reject) => {
            messageQueue.push({ prompt: clarifyPrompt, resolve, reject });
            processQueue();
          });
          
          return {
            formattedResult: aiResponse + '\n\n**To add options:** Say "add [new options]" or "include [new options] with existing"\n**To replace all:** Say "replace with [new options]" or just list the new options',
            functionResult: null
          };
        } catch (error) {
          return {
            formattedResult: 'I understand you want to add new options while keeping the existing ones. Please tell me which new options you\'d like to add to your current list:\n\nCurrent options:\n' +
              (optionsUpdateState.currentOptions?.map((opt: any, idx: number) => `${idx + 1}. ${opt.text}`).join('\n') || 'None') +
              '\n\nWhat new options would you like to add?',
            functionResult: null
          };
        }
      }
      
      // Check if user wants to ADD options (append to existing)
      const isAddingOptions = userMsg.includes('add') || 
                             userMsg.includes('include') || 
                             userMsg.includes('also') ||
                             userMsg.includes('plus') ||
                             userMsg.includes('with') ||
                             userMsg.includes('keep existing') ||
                             userMsg.includes('append');
      
      // Check if user wants to REPLACE all options
      const isReplacingOptions = userMsg.includes('replace') ||
                                userMsg.includes('change to') ||
                                userMsg.includes('new options') ||
                                (!isAddingOptions && (userMsg.includes(',') || userMsg.includes('\n')));
      
      // Parse options from message
      let newOptionsForUpdate: string[] = [];
      let optionsUpdateText = message.trim();
      
      // Remove action words if present
      optionsUpdateText = optionsUpdateText.replace(/^(add|include|also|plus|replace with|change to)\s*/i, '');
      optionsUpdateText = optionsUpdateText.replace(/\s*(with existing|with old|with current).*$/i, '');
      
      if (optionsUpdateText.includes(',')) {
        newOptionsForUpdate = optionsUpdateText.split(',').map(opt => opt.trim()).filter(opt => opt.length > 0);
      } else if (optionsUpdateText.includes('\n')) {
        newOptionsForUpdate = optionsUpdateText.split('\n').map(opt => opt.trim()).filter(opt => opt.length > 0);
      } else if (optionsUpdateText.trim().length > 0) {
        newOptionsForUpdate = [optionsUpdateText.trim()];
      }

      if (newOptionsForUpdate.length === 0) {
        return {
          formattedResult: 'Please provide the new options you want to add. For example:\n\n**To add options:** "add Mumbai, Delhi"\n**To replace all options:** "Option A, Option B, Option C"',
          functionResult: null
        };
      }

      // Handle ADD vs REPLACE logic
      let finalOptions: string[] = [];
      let updateType: 'added' | 'replaced' = 'replaced';
      
      if (isAddingOptions && !isReplacingOptions) {
        // ADD new options to existing ones
        const currentOptionsTexts = optionsUpdateState.currentOptions?.map((opt: any) => opt.text) || [];
        finalOptions = [...currentOptionsTexts, ...newOptionsForUpdate];
        updateType = 'added';
        
        // Remove duplicates while preserving order
        finalOptions = finalOptions.filter((option, index, array) => 
          array.findIndex(opt => opt.toLowerCase() === option.toLowerCase()) === index
        );
        
      } else {
        // REPLACE all options with new ones
        finalOptions = newOptionsForUpdate;
        updateType = 'replaced';
      }

      if (finalOptions.length < 2) {
        return {
          formattedResult: 'A poll needs at least 2 options. Please provide more options.',
          functionResult: null
        };
      }

      optionsUpdateState.newValue = finalOptions;
      optionsUpdateState.updateType = updateType;
      optionsUpdateState.step = 'confirm_update';
      setPollUpdateState(userId, optionsUpdateState);

      const currentOptionsDisplay = optionsUpdateState.currentOptions?.map((opt: any, idx: number) => `${idx + 1}. ${opt.text}`).join('\n') || 'None';
      const newOptionsDisplay = finalOptions.map((opt: string, idx: number) => `${idx + 1}. ${opt}`).join('\n');

      return {
        formattedResult: `**Options Update Summary:**\n\n` +
          `**Current options:**\n${currentOptionsDisplay}\n\n` +
          `**${updateType === 'added' ? 'New options after adding' : 'New options (replacing all)'}:**\n${newOptionsDisplay}\n\n` +
          `You are ${updateType === 'added' ? 'adding ' + newOptionsForUpdate.length + ' new option(s) to your existing ' + (optionsUpdateState.currentOptions?.length || 0) + ' option(s)' : 'replacing all options with ' + finalOptions.length + ' new option(s)'}.\n\n` +
          `Is this correct? Reply "confirm" to proceed or "cancel" to stop.`,
        functionResult: null
      };

    case 'update_poll_confirm':
      if (userRole !== 'admin' || !userId) {
        return {
          formattedResult: 'Sorry, only admin users can update polls.',
          functionResult: null
        };
      }

      const confirmUpdateState = getPollUpdateState(userId);
      if (!confirmUpdateState || confirmUpdateState.step !== 'confirm_update') {
        return {
          formattedResult: 'Please start the update process by saying "update poll".',
          functionResult: null
        };
      }

      if (message.toLowerCase().includes('cancel')) {
        setPollUpdateState(userId, null);
        return {
          formattedResult: 'Poll update cancelled. How else can I help you?',
          functionResult: null
        };
      }

      const updateConfirmPatterns = ['confirm', 'yes', 'yeah', 'yep', 'sure', 'ok', 'okay', 'go ahead', 'proceed'];
      const updateIsConfirming = updateConfirmPatterns.some(pattern => message.toLowerCase().includes(pattern));

      if (!updateIsConfirming) {
        return {
          formattedResult: 'Please reply "confirm" to update the poll or "cancel" to stop.',
          functionResult: null
        };
      }

      try {
        const { pollId, field, newValue } = confirmUpdateState;

        if (field === 'title') {
          await supabase
            .from('polls')
            .update({ title: newValue, question: newValue })
            .eq('id', pollId);
        } else if (field === 'options') {
          // Delete existing options and add new ones
          await supabase
            .from('poll_options')
            .delete()
            .eq('poll_id', pollId);

          const optionsToInsert = (newValue as string[]).map((option, index) => ({
            poll_id: pollId,
            text: option,
            position: index + 1,
          }));

          await supabase
            .from('poll_options')
            .insert(optionsToInsert);
        } else if (field === 'end_date') {
          await supabase
            .from('polls')
            .update({ end_date: newValue })
            .eq('id', pollId);
        } else if (field === 'category') {
          await supabase
            .from('polls')
            .update({ category: newValue })
            .eq('id', pollId);
        }

        setPollUpdateState(userId, null);

        return {
          formattedResult: `✅ Poll updated successfully!\n\nThe ${field} has been updated for poll "${confirmUpdateState.pollTitle}".`,
          functionResult: { success: true, pollId, field, newValue }
        };
      } catch (error: any) {
        logger.error('Error updating poll:', error);
        return {
          formattedResult: `Sorry, there was an error updating your poll: ${error.message}. Please try again.`,
          functionResult: null
        };
      }

    case 'add_poll_options':
      if (userRole !== 'admin' || !userId) {
        return {
          formattedResult: 'Sorry, only admin users can update polls.',
          functionResult: null
        };
      }

      const addOptionsState = getPollUpdateState(userId);
      if (!addOptionsState || addOptionsState.step !== 'update_options') {
        return {
          formattedResult: 'Please start the update process by saying "update poll".',
          functionResult: null
        };
      }

      // Parse new options to add
      let optionsToAdd: string[] = [];
      let addText = message.trim();
      
      // Remove action words
      addText = addText.replace(/^(add|include|also|plus|append)\s*/i, '');
      addText = addText.replace(/\s*(to existing|with existing|with old|with current).*$/i, '');
      
      if (addText.includes(',')) {
        optionsToAdd = addText.split(',').map(opt => opt.trim()).filter(opt => opt.length > 0);
      } else if (addText.includes('\n')) {
        optionsToAdd = addText.split('\n').map(opt => opt.trim()).filter(opt => opt.length > 0);
      } else if (addText.trim().length > 0) {
        optionsToAdd = [addText.trim()];
      }

      if (optionsToAdd.length === 0) {
        return {
          formattedResult: 'Please tell me which new options you want to add. For example: "add Mumbai, Delhi" or "include Option A, Option B"',
          functionResult: null
        };
      }

      // Combine with existing options
      const existingOptions = addOptionsState.currentOptions?.map((opt: any) => opt.text) || [];
      const combinedOptions = [...existingOptions, ...optionsToAdd];
      
      // Remove duplicates while preserving order
      const finalCombinedOptions = combinedOptions.filter((option, index, array) => 
        array.findIndex(opt => opt.toLowerCase() === option.toLowerCase()) === index
      );

      addOptionsState.newValue = finalCombinedOptions;
      addOptionsState.updateType = 'added';
      addOptionsState.step = 'confirm_update';
      setPollUpdateState(userId, addOptionsState);

      return {
        formattedResult: `**Adding Options to Poll**\n\n` +
          `**Current options:**\n${existingOptions.map((opt: string, idx: number) => `${idx + 1}. ${opt}`).join('\n')}\n\n` +
          `**New options to add:**\n${optionsToAdd.map((opt: string, idx: number) => `${existingOptions.length + idx + 1}. ${opt}`).join('\n')}\n\n` +
          `**Final options list:**\n${finalCombinedOptions.map((opt: string, idx: number) => `${idx + 1}. ${opt}`).join('\n')}\n\n` +
          `Perfect! You're adding ${optionsToAdd.length} new option(s) to your existing ${existingOptions.length} option(s).\n\n` +
          `Reply "confirm" to add these options or "cancel" to stop.`,
        functionResult: null
      };

    case 'clarify_poll_options_intent':
      if (userRole !== 'admin' || !userId) {
        return {
          formattedResult: 'Sorry, only admin users can update polls.',
          functionResult: null
        };
      }

      const clarifyState = getPollUpdateState(userId);
      if (!clarifyState || clarifyState.step !== 'update_options') {
        return {
          formattedResult: 'Please start the update process by saying "update poll".',
          functionResult: null
        };
      }

      try {
        const clarifyPrompt = prompts.pollUpdatePrompt('clarify_options_intent', {
          title: clarifyState.pollTitle,
          currentOptions: clarifyState.currentOptions
        }, message);
        
        const aiResponse = await new Promise<string>((resolve, reject) => {
          messageQueue.push({ prompt: clarifyPrompt, resolve, reject });
          processQueue();
        });
        
        return {
          formattedResult: aiResponse + '\n\n' +
            `**Current options:**\n${clarifyState.currentOptions?.map((opt: any, idx: number) => `${idx + 1}. ${opt.text}`).join('\n') || 'None'}\n\n` +
            `**How to proceed:**\n` +
            `• **To add new options:** Say "add Mumbai, Delhi" (keeps existing + adds new)\n` +
            `• **To replace all options:** Just list new options "Option A, Option B, Option C"\n` +
            `• **For help:** Say "help with options" or "I need guidance"\n\n` +
            `What would you like to do?`,
          functionResult: null
        };
      } catch (error) {
        return {
          formattedResult: 'I understand you want to modify the poll options. Let me help clarify:\n\n' +
            `**Current options:**\n${clarifyState.currentOptions?.map((opt: any, idx: number) => `${idx + 1}. ${opt.text}`).join('\n') || 'None'}\n\n` +
            `**Choose your action:**\n` +
            `• **To ADD new options (keeping current ones):** Say "add [new options]"\n` +
            `• **To REPLACE all options:** Just list the new options\n\n` +
            `For example:\n` +
            `- "add Mumbai, Delhi" → Adds to existing options\n` +
            `- "Option A, Option B" → Replaces all options\n\n` +
            `What would you like to do?`,
          functionResult: null
        };
      }

    case 'delete_poll':
      if (userRole !== 'admin' || !userId) {
        return {
          formattedResult: 'Sorry, only admin users can delete polls.',
          functionResult: null
        };
      }

      // Get user's polls
      const { data: deletablePolls } = await supabase
        .from('polls')
        .select('id, title, status')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (!deletablePolls || deletablePolls.length === 0) {
        return {
          formattedResult: 'You don\'t have any polls to delete.',
          functionResult: null
        };
      }

      return {
        formattedResult: `Here are your polls:\n\n` +
          deletablePolls.map((poll: any, idx: number) =>
            `${idx + 1}. ${poll.title} (Status: ${poll.status})`
          ).join('\n') +
          '\n\n⚠️ **Warning**: Deleting a poll will permanently remove all votes and data.\n\nReply with the poll number to delete, or "cancel" to stop.',
        functionResult: deletablePolls
      };

    case 'list_my_polls':
      if (userRole !== 'admin' || !userId) {
        return {
          formattedResult: 'Sorry, only admin users have created polls to view.',
          functionResult: null
        };
      }

      const { data: myPolls } = await supabase
        .from('polls')
        .select('id, title, category, status, end_date, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (!myPolls || myPolls.length === 0) {
        return {
          formattedResult: 'You haven\'t created any polls yet. Would you like to create one?',
          functionResult: null
        };
      }

      return {
        formattedResult: `Here are your polls (${myPolls.length} total):\n\n` +
          myPolls.map((poll: any, idx: number) =>
            `${idx + 1}. ${poll.title}\n   ID: ${poll.id}\n   Category: ${poll.category}\n   Status: ${poll.status}\n   Created: ${new Date(poll.created_at).toLocaleDateString()}\n   Ends: ${new Date(poll.end_date).toLocaleDateString()}`
          ).join('\n\n'),
        functionResult: myPolls
      };

    case 'poll_analytics':
      if (userRole !== 'admin' || !userId) {
        return {
          formattedResult: 'Sorry, only admin users can view poll analytics.',
          functionResult: null
        };
      }

      // Get basic analytics for user's polls
      const { data: pollsWithVotes } = await supabase
        .from('polls')
        .select(`
          id, title, status,
          votes(id),
          poll_options(id)
        `)
        .eq('user_id', userId);

      if (!pollsWithVotes || pollsWithVotes.length === 0) {
        return {
          formattedResult: 'You don\'t have any polls to analyze yet.',
          functionResult: null
        };
      }

      const analytics = pollsWithVotes.map((poll: any) => ({
        title: poll.title,
        status: poll.status,
        totalVotes: poll.votes?.length || 0,
        totalOptions: poll.poll_options?.length || 0
      }));

      const totalPolls = analytics.length;
      const totalVotes = analytics.reduce((sum, poll) => sum + poll.totalVotes, 0);
      const activePolls = analytics.filter(poll => poll.status === 'active').length;

      return {
        formattedResult: `📊 **Your Poll Analytics**\n\n` +
          `**Overview:**\n` +
          `• Total Polls: ${totalPolls}\n` +
          `• Active Polls: ${activePolls}\n` +
          `• Total Votes Received: ${totalVotes}\n` +
          `• Average Votes per Poll: ${totalPolls > 0 ? Math.round(totalVotes / totalPolls) : 0}\n\n` +
          `**Individual Poll Performance:**\n` +
          analytics.map((poll, idx) =>
            `${idx + 1}. ${poll.title}\n   • Votes: ${poll.totalVotes}\n   • Options: ${poll.totalOptions}\n   • Status: ${poll.status}`
          ).join('\n\n'),
        functionResult: analytics
      };
      
    default:
      // For general conversations or unhandled intents
      try {
        // Handle common affirmative responses when not in a state
        if ((msg === 'yes' || msg === 'yeah' || msg === 'sure' || msg === 'ok' || msg === 'okay') && 
            !currentState && !currentUpdateState) {
          // If the last bot message was asking about showing polls, show them
          const lastBotMessage = history.filter(h => h.role === 'assistant').slice(-1)[0]?.content;
          if (lastBotMessage && lastBotMessage.includes('Would you like to see the available polls')) {
            // Show available polls
            const { data: pollsData } = await supabase
              .from('polls')
              .select('id, title, category, end_date, status')
              .order('end_date', { ascending: true });

            return {
              formattedResult: pollsData && pollsData.length > 0 
                ? 'Here are the available polls:\n' + pollsData.map(
                    (poll: any, idx: number) =>
                      `${idx + 1}. ${poll.title}\n   Poll ID: ${poll.id}\n   Category: ${poll.category}\n   Ends: ${new Date(poll.end_date).toLocaleString()}\n   Status: ${poll.status}`
                  ).join('\n\n')
                : 'There are no polls available right now. Check back later or ask an admin to create some polls!',
              functionResult: pollsData
            };
          }
        }
        
        const conversationContext = history.slice(-6).map(h => `${h.role}: ${h.content}`).join('\n');
        const generalPromptText = prompts.generalPrompt(conversationContext, message, userRole);
        
        const aiResponse = await new Promise<string>((resolve, reject) => {
          messageQueue.push({ prompt: generalPromptText, resolve, reject });
          processQueue();
        });
        
        return {
          formattedResult: aiResponse,
          functionResult: null
        };
      } catch (error) {
        logger.error('Error generating general response:', error);
        return {
          formattedResult: FALLBACK_RESPONSES.generic,
          functionResult: null
        };
      }
  }
}

/**
 * Process a chat message
 */
export async function processMessage(
  messages: ChatMessage[],
  userId?: string
): Promise<ChatResponse> {
  try {
    if (!messages.length) {
      return { message: { role: 'assistant', content: '' }, functionResult: null, formattedResult: null, history: [] };
    }
    
    const lastMessage = messages[messages.length - 1];
    if (lastMessage.role !== 'user') {
      return { message: { role: 'assistant', content: '' }, functionResult: null, formattedResult: null, history: messages };
    }
    
    // Load history from database if userId is provided
    let history = messages;
    if (userId) {
      history = await loadChatHistory(userId);
      
      // If no history, add a welcome message
      if (history.length === 0) {
        const welcomeMessage: ChatMessage = {
          role: 'assistant',
          content: `Hi! I'm PollBot, your friendly assistant for polls and voting! 🗳️\n\nI can help you with:\n• Viewing available polls\n• Voting on polls\n• Checking your voting status\n${userId ? '• Creating new polls (if you\'re an admin)' : ''}\n\nWhat would you like to do today?`
        };
        
        await saveMessageToHistory(userId, welcomeMessage);
        history = [welcomeMessage];
      }
    }
    
    // Get user role
    let userRole = 'user';
    if (userId) {
      const { data: userData, error: userError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .single();

      if (!userError && userData) {
        userRole = userData.role;
      }
    }
    
    // Add the new message to history
    if (userId) {
      await saveMessageToHistory(userId, lastMessage);
      history = [...history, lastMessage];
    }
    
    // Get the current state and detect intent
    const currentState = userId ? getPollCreationState(userId) : undefined;
    const currentUpdateState = userId ? getPollUpdateState(userId) : undefined;
    const intent = detectIntent(lastMessage.content, currentState, currentUpdateState);
    
    // Handle the intent
    const { formattedResult, functionResult } = await handleIntent(
      intent, 
      lastMessage.content, 
      userId, 
      userRole, 
      history
    );
    
    // Create response message
    const responseMessage: ChatMessage = {
      role: 'assistant',
      content: formattedResult || ''
    };
    
    // Save response to history
    if (userId && formattedResult) {
      await saveMessageToHistory(userId, responseMessage);
      history = [...history, responseMessage];
    }
    
    return {
      message: responseMessage,
      functionResult,
      formattedResult,
      history
    };
  } catch (error: any) {
    logger.error('Error in processMessage:', error);
    
    const errorMessage: ChatMessage = {
      role: 'assistant',
      content: FALLBACK_RESPONSES.error
    };
    
    return {
      message: errorMessage,
      functionResult: null,
      formattedResult: FALLBACK_RESPONSES.error,
      history: [...messages, errorMessage]
    };
  }
} 