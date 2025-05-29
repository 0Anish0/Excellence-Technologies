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
import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createClient } from '@supabase/supabase-js';

// Debug logging
const DEBUG = true;
const logDebug = (...args: any[]) => {
  if (DEBUG) {
    console.log('[Chat Debug]', ...args);
  }
};

// Queue system
const messageQueue: Array<{
  prompt: string;
  resolve: (value: string) => void;
  reject: (error: any) => void;
}> = [];
let isProcessing = false;

// Rate limit handling
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 60;
let requestCount = 0;
let windowStart = Date.now();

// Fallback responses
const FALLBACK_RESPONSES = {
  rateLimit: "I'm currently handling a lot of requests. Please try again in a few moments.",
  error: "I'm having trouble processing your request right now. Please try again later.",
  generic: "I'm here to help with polls and voting! You can ask me to show polls, vote on a poll, create a new poll (if you're an admin), or suggest options for a poll."
};

// Validate API key
if (!process.env.GEMINI_API_KEY) {
  console.error('GEMINI_API_KEY is not set in environment variables');
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Enhanced intent detection
function detectIntent(message: string, pollCreationState?: PollCreationState): string {
  const msg = message.toLowerCase().trim();

  // Check if in active poll creation and user wants to proceed
  if (pollCreationState && (
    msg.includes('proceed') || 
    msg.includes('continue') || 
    msg.includes('previous') || 
    msg.includes('same question') ||
    msg.includes('create poll with') ||
    msg.includes('with this given option')
  )) {
    // Determine which step to continue with
    if (pollCreationState.step === 'category' && pollCreationState.category) {
      return 'create_poll_topic';
    } else if (pollCreationState.step === 'topic' && pollCreationState.topic) {
      return 'create_poll_options';
    } else if (pollCreationState.step === 'options' && pollCreationState.options) {
      return 'create_poll_confirm';
    } else {
      return 'continue_poll_creation';
    }
  }

  // Greetings
  const greetings = ['hey', 'hello', 'hi', 'good morning', 'good afternoon', 'good evening', 'greetings'];
  if (greetings.some(greet => msg === greet || msg.startsWith(greet + ' ') || msg.startsWith(greet + ','))) {
    return 'greeting';
  }

  // Show/List polls
  if (msg.match(/\b(show|list|display|see|view|get|what are|tell me about|available)\b.*\b(polls?|poll list)\b/i) ||
      msg === 'polls' || msg === 'show polls' || msg === 'list polls') {
    return 'list_polls';
  }

  // Poll options
  if (msg.match(/\b(show|get|what are|see|view)\b.*\b(options?|choices?)\b/i) ||
      msg.match(/\boptions?\b.*\b(poll|for)\b/i) ||
      msg.match(/\bpoll\b.*\boptions?\b/i)) {
    return 'get_poll_options';
  }

  // Voting
  if (msg.match(/\b(vote|cast|choose|select|pick)\b/i) ||
      msg.match(/\bi want to vote\b/i) ||
      msg.match(/\bcan i vote\b/i) ||
      msg.match(/\bhow to vote\b/i)) {
    return 'vote';
  }

  // Poll creation - handling direct category inputs
  if (msg.match(/\b(technology|politics|entertainment|other)\b/i) && pollCreationState && pollCreationState.step === 'category') {
    return 'create_poll_category';
  }

  // Poll creation
  if (msg.match(/\b(create|make|add|new|lets create)\b.*\bpoll\b/i) ||
      msg.match(/\bpoll\b.*\b(create|creation|make|new)\b/i) ||
      msg.match(/\bpoll.*(ai|education|medical|technology|politics|entertainment)\b/i)) {
    if (msg.includes('category:') || msg.match(/\bcategory\b.*\b(is|:)\b/i)) {
      return 'create_poll_category';
    } else if (msg.includes('topic:') || msg.includes('question:')) {
      return 'create_poll_topic';
    } else if (msg.includes('options:') || msg.match(/\boption\b.*\b(add|set|list)\b/i)) {
      return 'create_poll_options';
    } else if (msg.includes('confirm') || msg.includes('cancel')) {
      return 'create_poll_confirm';
    } else if (msg.includes('restart') || msg.includes('start over')) {
      return 'create_poll_restart';
    } else {
      return 'create_poll';
    }
  }

  // Direct options input when in the options step
  if (pollCreationState && pollCreationState.step === 'options' && 
      (msg.includes(',') || msg.split(/\s+/).length <= 6)) {
    return 'create_poll_options';
  }

  // Direct question input when in the topic step
  if (pollCreationState && pollCreationState.step === 'topic' && 
      (msg.endsWith('?') || msg.length > 10)) {
    return 'create_poll_topic';
  }

  // Option suggestion
  if (msg.match(/\b(suggest|give|provide|help|make|create)\b.*\b(options?|choices?)\b/i) ||
      msg.match(/\boptions?\b.*\b(suggest|ideas|recommend)\b/i)) {
    return 'suggest_options';
  }

  // Check voting status
  if (msg.match(/\b(did i vote|have i voted|voted already|my vote|voting status)\b/i)) {
    return 'check_vote_status';
  }

  // View poll results
  if (msg.match(/\b(result|results|status|outcome|how many voted)\b.*\bpoll\b/i)) {
    return 'view_poll_results';
  }

  // Fallback to appropriate step if in poll creation and no specific intent
  if (pollCreationState) {
    if (pollCreationState.step === 'category') {
      return 'create_poll_category';
    } else if (pollCreationState.step === 'topic') {
      return 'create_poll_topic';
    } else if (pollCreationState.step === 'options') {
      return 'create_poll_options';
    } else if (pollCreationState.step === 'confirm') {
      return 'create_poll_confirm';
    }
  }

  return 'general';
}

// Poll creation state
interface PollCreationState {
  step: 'category' | 'topic' | 'options' | 'confirm';
  category?: string;
  topic?: string;
  title?: string;
  options?: string[];
  userId?: string;
  suggestedOptions?: string[];
}

const pollCreationStates = new Map<string, PollCreationState>();

// Process queue
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
    logDebug('Processing queue item, current request count:', requestCount);

    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is not configured');
    }

    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });
    logDebug('Model initialized, generating content');

    try {
      const result = await model.generateContent(prompt);
      logDebug('Received response from Gemini');

      if (!result.response) {
        throw new Error('No response from Gemini API');
      }

      const text = result.response.text();
      logDebug('Successfully processed message');
      resolve(text);
    } catch (error: any) {
      if (error.message?.includes('429 Too Many Requests')) {
        const quotaError = {
          status: 429,
          message: "I'm currently experiencing high demand. Please try again in a minute.",
          details: error.message
        };
        logDebug('Quota limit exceeded:', quotaError);
        reject(quotaError);
      } else {
        throw error;
      }
    }
  } catch (error: any) {
    logDebug('Error in processQueue:', error);

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

export async function POST(req: NextRequest) {
  try {
    logDebug('Starting chat request');
    const { messages, userId } = await req.json();
    logDebug('Received messages:', messages?.length || 0);
    logDebug('User ID:', userId);

    // Load chat history
    let history: { role: string; content: string }[] = [];
    if (userId) {
      logDebug('Loading chat history for user:', userId);
      
      try {
        // Get the count first to see how many messages exist
        const { count, error: countError } = await supabase
          .from('chat_history')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId);
          
        if (countError) {
          logDebug('Error counting chat history:', countError);
        } else {
          logDebug(`Total chat history entries for user: ${count}`);
        }
        
        // Increase the limit and ensure we're getting the most recent messages
        const { data: chatRows, error: historyError } = await supabase
          .from('chat_history')
          .select('id, message, role, created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false }) // Get newest messages first
          .limit(50); // Increase limit to get more context

        if (historyError) {
          logDebug('Error loading chat history:', historyError);
        } else {
          logDebug('Loaded chat history rows:', chatRows?.length || 0);
          if (chatRows && chatRows.length > 0) {
            // Log each row's created_at to check sorting
            chatRows.slice(0, 5).forEach((row, i) => {
              logDebug(`Row ${i} created_at: ${row.created_at}, ID: ${row.id.substring(0, 8)}`);
            });
            
            // Reverse the array to get chronological order again after getting newest first
            history = chatRows.reverse().map((row: any) => ({ 
              role: row.role, 
              content: row.message 
            }));
            
            // Add debug logging to help diagnose issues
            logDebug('First message:', history[0]?.content.substring(0, 50));
            logDebug('Last message:', history[history.length - 1]?.content.substring(0, 50));
          } else {
            logDebug('No chat history found for user');
          }
        }
      } catch (err) {
        logDebug('Unexpected error loading chat history:', err);
      }
    }

    const lastMessage = messages[messages.length - 1];
    if (!lastMessage || lastMessage.role !== 'user') {
      logDebug('No new user message to process. Returning current history.');
      
      // Check if history is empty, if so add a welcome message
      if (history.length === 0) {
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
        
        const welcomeMessage = {
          role: 'assistant', 
          content: `Hi! I'm PollBot, your friendly assistant for polls and voting! 🗳️\n\nI can help you with:\n• Viewing available polls\n• Voting on polls\n• Checking your voting status\n${userRole === 'admin' ? '• Creating new polls\n• Editing polls' : ''}\n\nWhat would you like to do today?`
        };
        
        // Save welcome message to history if it doesn't exist
        if (userId) {
          await supabase.from('chat_history').insert([
            { user_id: userId, message: welcomeMessage.content, role: 'assistant' }
          ]);
          
          history = [welcomeMessage];
        }
      }
      
      return NextResponse.json({
        message: { role: 'assistant', content: '' },
        functionResult: null,
        formattedResult: null,
        history,
      });
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
      logDebug('User role:', userRole);
    }

    // Get current poll creation state
    const currentState = pollCreationStates.get(userId);
    const userIntent = detectIntent(lastMessage.content, currentState);
    logDebug('Detected intent:', userIntent);

    let botResponse = '';
    let functionResult = null;
    let formattedResult = null;

    switch (userIntent) {
      case 'greeting':
        botResponse = `Hi! I'm PollBot, your friendly assistant for polls and voting! 🗳️\n\nI can help you with:\n• Viewing available polls\n• Voting on polls\n• Checking your voting status\n${userRole === 'admin' ? '• Creating new polls\n• Editing polls' : ''}\n\nWhat would you like to do today?`;
        break;

      case 'list_polls':
        botResponse = "Let me show you the available polls...";
        const { data: pollsData } = await supabase
          .from('polls')
          .select('id, title, category, end_date, status')
          .order('end_date', { ascending: true });

        functionResult = pollsData;
        if (pollsData && pollsData.length > 0) {
          formattedResult = 'Here are the available polls:\n' + pollsData.map(
            (poll: any, idx: number) =>
              `${idx + 1}. ${poll.title}\n   Poll ID: ${poll.id}\n   Category: ${poll.category}\n   Ends: ${new Date(poll.end_date).toLocaleString()}\n   Status: ${poll.status}`
          ).join('\n\n');
        } else {
          formattedResult = 'There are no polls available right now. Check back later or ask an admin to create some polls!';
        }
        break;

      case 'get_poll_options':
        const pollMatch = lastMessage.content.match(/poll\s+(\d+|[a-f0-9-]{36})/i);
        if (pollMatch) {
          let pollId = pollMatch[1];

          if (/^\d+$/.test(pollId)) {
            const { data: polls } = await supabase.from('polls').select('id').order('end_date', { ascending: true });
            const idx = parseInt(pollId, 10) - 1;
            if (polls && polls[idx]) {
              pollId = polls[idx].id;
            } else {
              formattedResult = 'Invalid poll number. Please check the available polls first.';
              break;
            }
          }

          const { data: pollData } = await supabase
            .from('polls')
            .select('*, poll_options(*)')
            .eq('id', pollId)
            .single();

          functionResult = pollData;
          if (pollData && pollData.poll_options && pollData.poll_options.length > 0) {
            formattedResult = `Here are the options for "${pollData.title}":\n` + pollData.poll_options
              .sort((a: any, b: any) => a.position - b.position)
              .map((opt: any, idx: number) => `   ${idx + 1}. ${opt.text}\n      Option ID: ${opt.id}`)
              .join('\n');
          } else {
            formattedResult = 'No options found for this poll.';
          }
        } else {
          formattedResult = 'Please specify which poll you want to see options for. You can say "show options for poll 1" or first ask me to list the polls.';
        }
        break;

      case 'vote':
        const voteMatch = lastMessage.content.match(/(?:poll\s+(\d+|[a-f0-9-]{36})).*?(?:option\s+(\d+)|(\d+))/i);
        if (voteMatch && userId) {
          let pollId = voteMatch[1];
          let optionNum = voteMatch[2] || voteMatch[3];

          if (pollId && /^\d+$/.test(pollId)) {
            const { data: polls } = await supabase.from('polls').select('id').order('end_date', { ascending: true });
            const idx = parseInt(pollId, 10) - 1;
            if (polls && polls[idx]) {
              pollId = polls[idx].id;
            } else {
              formattedResult = 'Invalid poll number.';
              break;
            }
          }

          const { data: existingVotes } = await supabase
            .from('votes')
            .select('id')
            .eq('poll_id', pollId)
            .eq('user_id', userId);

          if (existingVotes && existingVotes.length > 0) {
            formattedResult = 'You have already voted in this poll. You can only vote once per poll.';
          } else {
            const { data: pollData } = await supabase
              .from('polls')
              .select('*, poll_options(*)')
              .eq('id', pollId)
              .single();

            if (pollData && pollData.poll_options) {
              const sortedOptions = pollData.poll_options.sort((a: any, b: any) => a.position - b.position);
              const optionIndex = parseInt(optionNum, 10) - 1;

              if (optionIndex >= 0 && optionIndex < sortedOptions.length) {
                const { error: voteError } = await supabase.from('votes').insert({
                  poll_id: pollId,
                  selected_option: optionIndex + 1,
                  user_id: userId,
                });

                if (voteError) {
                  formattedResult = 'Sorry, I could not record your vote: ' + voteError.message;
                } else {
                  functionResult = { success: true };
                  formattedResult = `🎉 Your vote has been recorded! You voted for "${sortedOptions[optionIndex].text}" in the poll "${pollData.title}". Thank you for participating!`;
                }
              } else {
                formattedResult = 'Invalid option number for this poll.';
              }
            } else {
              formattedResult = 'Poll not found.';
            }
          }
        } else {
          formattedResult = 'To vote, please specify the poll and option. For example: "I want to vote for option 2 in poll 1" or first ask me to show you the available polls and their options.';
        }
        break;

      case 'create_poll':
        if (userRole !== 'admin') {
          formattedResult = 'Sorry, only admin users can create polls. If you need a new poll created, please contact an administrator.';
        } else if (userId) {
          pollCreationStates.set(userId, { step: 'category', userId });
          formattedResult = 'Great! Let\'s create a new poll together. First, please choose a category for your poll:\n\n• Politics\n• Technology\n• Entertainment\n• Other\n\nReply with "category: [your choice]" (e.g., "category: Technology")';
        } else {
          formattedResult = 'Please log in to create a poll.';
        }
        break;

      case 'create_poll_category':
        if (userRole !== 'admin' || !userId) {
          formattedResult = 'Sorry, only admin users can create polls. If you need a new poll created, please contact an administrator.';
          break;
        }

        // Extract category from message, handle direct category input
        let categoryText = lastMessage.content.trim();
        const categoryMatch = categoryText.match(/category:\s*(\w+)/i);
        
        if (categoryMatch && categoryMatch[1]) {
          categoryText = categoryMatch[1];
        }
        
        const validCategories = ['Politics', 'Technology', 'Entertainment', 'Other'];
        const normalizedCategory = validCategories.find(
          c => c.toLowerCase() === categoryText.toLowerCase()
        );

        if (normalizedCategory) {
          const state: PollCreationState = pollCreationStates.get(userId) || { step: 'category', userId, category: undefined, topic: undefined, title: undefined, options: undefined, suggestedOptions: undefined };
          state.category = normalizedCategory;
          state.step = 'topic';
          pollCreationStates.set(userId, state);

          formattedResult = `Great! Category set to "${normalizedCategory}". Now, please provide the main topic or question for your poll.`;
        } else {
          formattedResult = 'Please select a valid category: Politics, Technology, Entertainment, or Other.';
        }
        break;

      case 'create_poll_topic':
        if (userRole !== 'admin' || !userId) {
          formattedResult = 'Sorry, only admin users can create polls. If you need a new poll created, please contact an administrator.';
          break;
        }

        const state = pollCreationStates.get(userId);
        if (!state) {
          formattedResult = 'Let\'s start over. Please choose a category for your poll:\n\n• Politics\n• Technology\n• Entertainment\n• Other';
          pollCreationStates.set(userId, { step: 'category', userId });
          break;
        }

        // Extract topic - handle direct input without requiring 'topic:' prefix
        let topicText = lastMessage.content.trim();
        const topicMatch = topicText.match(/topic:|question:\s*(.+)/i);
        
        if (topicMatch && topicMatch[1]) {
          topicText = topicMatch[1].trim();
        }

        if (topicText.length < 10) {
          formattedResult = 'Please provide a more detailed topic or question (at least 10 characters).';
          break;
        }

        const title = topicText.length > 60 ? topicText.substring(0, 57) + '...' : topicText;
        state.topic = topicText;
        state.title = title;
        state.step = 'options';
        pollCreationStates.set(userId, state);

        formattedResult = `Great! Now let's add some options for your poll "${title}".\n\nPlease provide at least 2 options separated by commas.`;
        break;

      case 'create_poll_options':
        if (userRole !== 'admin' || !userId) {
          formattedResult = 'Sorry, only admin users can create polls. If you need a new poll created, please contact an administrator.';
          break;
        }

        const optionsState = pollCreationStates.get(userId);
        if (!optionsState) {
          formattedResult = 'Let\'s start over. Please choose a category for your poll:\n\n• Politics\n• Technology\n• Entertainment\n• Other';
          pollCreationStates.set(userId, { step: 'category', userId });
          break;
        }

        // Process options directly from message without requiring 'options:' prefix
        let optionsText = lastMessage.content.trim();
        const optionsMatch = optionsText.match(/options:\s*(.+)/i);
        
        if (optionsMatch && optionsMatch[1]) {
          optionsText = optionsMatch[1].trim();
        }
        
        const options = optionsText.split(',').map((opt: string) => opt.trim()).filter((opt: string) => opt.length > 0);

        if (options.length < 2) {
          formattedResult = 'Please provide at least 2 options for your poll, separated by commas.';
          break;
        }

        const uniqueOptions = Array.from(new Set(options));
        if (uniqueOptions.length !== options.length) {
          formattedResult = 'Please ensure all options are unique.';
          break;
        }

        optionsState.options = options;
        optionsState.step = 'confirm';
        pollCreationStates.set(userId, optionsState);

        formattedResult = `Here's a summary of your poll:\n\n` +
          `**Category:** ${optionsState.category}\n` +
          `**Title:** ${optionsState.title}\n` +
          `**Question:** ${optionsState.topic}\n\n` +
          `**Options:**\n${options.map((opt: string, i: number) => `${i + 1}. ${opt}`).join('\n')}\n\n` +
          `Reply with "confirm" to create this poll, "cancel" to start over, or "edit" to change something.`;
        break;

      case 'create_poll_confirm':
        if (userRole !== 'admin' || !userId) {
          formattedResult = 'Sorry, only admin users can create polls. If you need a new poll created, please contact an administrator.';
          break;
        }

        const confirmState = pollCreationStates.get(userId);
        if (!confirmState || confirmState.step !== 'confirm') {
          formattedResult = 'Let\'s start over. Please choose a category for your poll:\n\n• Politics\n• Technology\n• Entertainment\n• Other';
          pollCreationStates.set(userId, { step: 'category', userId });
          break;
        }

        if (lastMessage.content.toLowerCase().includes('cancel')) {
          pollCreationStates.delete(userId);
          formattedResult = 'Poll creation cancelled. How else can I help you today?';
          break;
        }

        if (lastMessage.content.toLowerCase().includes('edit')) {
          confirmState.step = 'category';
          pollCreationStates.set(userId, confirmState);
          formattedResult = 'Let\'s edit your poll. Please choose a category again:\n\n• Politics\n• Technology\n• Entertainment\n• Other';
          break;
        }

        if (lastMessage.content.toLowerCase().includes('confirm')) {
          try {
            const pollDataToInsert = {
              user_id: userId,
              title: confirmState.title,
              question: confirmState.topic,
              category: confirmState.category,
              end_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
              status: 'active',
            };

            logDebug('Creating poll with data:', pollDataToInsert);

            const { data: pollData, error: pollError } = await supabase
              .from('polls')
              .insert(pollDataToInsert)
              .select('*')
              .single();

            if (pollError) {
              logDebug('Error creating poll:', pollError);
              throw new Error(`Failed to create poll: ${pollError.message}`);
            }

            const optionsToInsert = confirmState.options!.map((option, index) => ({
              poll_id: pollData.id,
              text: option,
              position: index + 1,
            }));

            const { data: optionsData, error: optionsError } = await supabase
              .from('poll_options')
              .insert(optionsToInsert)
              .select('*');

            if (optionsError) {
              logDebug('Error creating poll options:', optionsError);
              await supabase.from('polls').delete().eq('id', pollData.id);
              throw new Error(`Failed to create poll options: ${optionsError.message}`);
            }

            pollCreationStates.delete(userId);

            functionResult = { success: true, pollId: pollData.id };
            formattedResult = `🎉 Poll created successfully!\n\n` +
              `**Title:** ${pollData.title}\n` +
              `**ID:** ${pollData.id}\n` +
              `**Category:** ${pollData.category}\n` +
              `**End Date:** ${new Date(pollData.end_date).toLocaleString()}\n\n` +
              `Users can now vote on this poll. You can view results by saying "show results for poll ${pollData.id}".`;
          } catch (error: any) {
            logDebug('Error in poll creation:', error);
            formattedResult = `Sorry, there was an error creating your poll: ${error.message}. Please try again.`;
          }
        } else {
          formattedResult = 'Please confirm by replying with "confirm", "cancel" to start over, or "edit" to change something.';
        }
        break;

      case 'create_poll_restart':
        if (userRole !== 'admin' || !userId) {
          formattedResult = 'Sorry, only admin users can create polls. If you need a new poll created, please contact an administrator.';
          break;
        }
        pollCreationStates.delete(userId);
        pollCreationStates.set(userId, { step: 'category', userId });
        formattedResult = 'Poll creation restarted. Please choose a category for your poll:\n\n• Politics\n• Technology\n• Entertainment\n• Other';
        break;

      case 'suggest_options':
        if (userRole !== 'admin' || !userId) {
          formattedResult = 'Sorry, only admin users can create polls and request option suggestions.';
          break;
        }

        const suggestState = pollCreationStates.get(userId);
        if (!suggestState || !suggestState.topic) {
          formattedResult = 'Please specify a poll topic first. Start by saying "create a poll" and follow the steps.';
          break;
        }

        const suggestionPrompt = `
You are PollBot, assisting with poll creation. The user is creating a poll with the topic: "${suggestState.topic}".
Suggest 4-6 relevant and concise poll options (each 5-15 words) that users can vote on.
Format the response as a numbered list of options.
Example:
1. Option one
2. Option two
3. Option three
4. Option four
`;

        try {
          const suggestedOptions = await new Promise<string>((resolve, reject) => {
            messageQueue.push({ prompt: suggestionPrompt, resolve, reject });
            processQueue();
          });

          suggestState.suggestedOptions = suggestedOptions.split('\n')
            .map(opt => opt.replace(/^\d+\.\s*/, '').trim())
            .filter(opt => opt.length > 0);
          pollCreationStates.set(userId, suggestState);

          formattedResult = `Here are some suggested options for your poll "${suggestState.title}":\n\n${suggestedOptions}\n\nPlease select options by replying with their numbers (e.g., "1, 2, 3") or provide your own with "options: [option1, option2, ...]".`;
        } catch (error) {
          formattedResult = 'Sorry, I couldn\'t generate suggestions right now. Please provide your own options with "options: [option1, option2, ...]".';
        }
        break;

      case 'check_vote_status':
        if (userId) {
          const { data: userVotes } = await supabase
            .from('votes')
            .select('poll_id, polls(title)')
            .eq('user_id', userId);

          if (userVotes && userVotes.length > 0) {
            const votedPolls = userVotes.map((vote: any) => vote.polls.title).join(', ');
            formattedResult = `You have voted in ${userVotes.length} poll(s): ${votedPolls}`;
          } else {
            formattedResult = "You haven't voted in any polls yet. Would you like to see the available polls?";
          }
        } else {
          formattedResult = 'Please log in to check your voting status.';
        }
        break;

      case 'view_poll_results':
        const resultMatch = lastMessage.content.match(/poll\s+(\d+|[a-f0-9-]{36})/i);
        if (resultMatch) {
          let pollId = resultMatch[1];

          if (/^\d+$/.test(pollId)) {
            const { data: polls } = await supabase.from('polls').select('id').order('end_date', { ascending: true });
            const idx = parseInt(pollId, 10) - 1;
            if (polls && polls[idx]) {
              pollId = polls[idx].id;
            } else {
              formattedResult = 'Invalid poll number. Please check the available polls first.';
              break;
            }
          }

          const { data: pollData } = await supabase
            .from('polls')
            .select('*, poll_options(*, votes(count))')
            .eq('id', pollId)
            .single();

          if (pollData && pollData.poll_options) {
            const totalVotes = pollData.poll_options.reduce((sum: number, opt: any) => sum + opt.votes[0]?.count || 0, 0);
            formattedResult = `Results for "${pollData.title}":\n` +
              pollData.poll_options
                .sort((a: any, b: any) => a.position - b.position)
                .map((opt: any) => {
                  const voteCount = opt.votes[0]?.count || 0;
                  const percentage = totalVotes > 0 ? ((voteCount / totalVotes) * 100).toFixed(1) : 0;
                  return `   ${opt.text}: ${voteCount} votes (${percentage}%)`;
                })
                .join('\n') +
              `\n\nTotal votes: ${totalVotes}`;
          } else {
            formattedResult = 'No results found for this poll.';
          }
        } else {
          formattedResult = 'Please specify which poll you want to see results for. You can say "show results for poll 1" or first ask me to list the polls.';
        }
        break;

      case 'continue_poll_creation':
        if (userRole !== 'admin' || !userId) {
          formattedResult = 'Sorry, only admin users can create polls. If you need a new poll created, please contact an administrator.';
          break;
        }
        
        const continueState = pollCreationStates.get(userId);
        if (!continueState) {
          formattedResult = 'Let\'s start a new poll creation. Please choose a category for your poll:\n\n• Politics\n• Technology\n• Entertainment\n• Other';
          pollCreationStates.set(userId, { step: 'category', userId });
          break;
        }
        
        if (continueState.step === 'category' && continueState.category) {
          continueState.step = 'topic';
          pollCreationStates.set(userId, continueState);
          formattedResult = `Great! Category set to "${continueState.category}". Now, please provide the main topic or question for your poll.`;
        } else if (continueState.step === 'topic' && continueState.topic) {
          continueState.step = 'options';
          pollCreationStates.set(userId, continueState);
          formattedResult = `Great! Now let's add some options for your poll "${continueState.title}".\n\nPlease provide at least 2 options separated by commas.`;
        } else if (continueState.step === 'options' && continueState.options) {
          continueState.step = 'confirm';
          pollCreationStates.set(userId, continueState);
          formattedResult = `Here's a summary of your poll:\n\n` +
            `**Category:** ${continueState.category}\n` +
            `**Title:** ${continueState.title}\n` +
            `**Question:** ${continueState.topic}\n\n` +
            `**Options:**\n${continueState.options.map((opt: string, i: number) => `${i + 1}. ${opt}`).join('\n')}\n\n` +
            `Reply with "confirm" to create this poll, "cancel" to start over, or "edit" to change something.`;
        } else {
          formattedResult = 'Let\'s start a new poll creation. Please choose a category for your poll:\n\n• Politics\n• Technology\n• Entertainment\n• Other';
          pollCreationStates.set(userId, { step: 'category', userId });
        }
        break;

      default:
        const conversationContext = history.slice(-6).map(h => `${h.role}: ${h.content}`).join('\n');
        const prompt = `
You are PollBot, a friendly chatbot for a polling app. Keep responses conversational and helpful.

Context of recent conversation:
${conversationContext}

User just said: "${lastMessage.content}"

Respond naturally and helpfully. If the user seems confused or asks unrelated questions, gently guide them back to poll-related topics like viewing polls, voting, or creating polls (if admin). Keep responses concise but friendly.

Examples of good responses:
- For "how are you": "I'm doing great! Ready to help you with polls and voting. What can I do for you?"
- For "what can you do": "I can help you view polls, vote on them, check your voting status, or create a poll if you're an admin. What interests you?"
- For unclear requests: "I'm here to help with polls! You can ask me to show available polls, help you vote, or check if you've already voted."
`;

        try {
          const aiResponse = await new Promise<string>((resolve, reject) => {
            messageQueue.push({ prompt, resolve, reject });
            processQueue();
          });
          formattedResult = aiResponse;
        } catch (error) {
          formattedResult = FALLBACK_RESPONSES.generic;
        }
        break;
    }

    // Save messages to chat history
    if (userId) {
      await supabase.from('chat_history').insert([
        { user_id: userId, message: lastMessage.content, role: 'user' }
      ]);

      await supabase.from('chat_history').insert([
        { user_id: userId, message: formattedResult || botResponse, role: 'assistant' }
      ]);

      const { data: chatRows } = await supabase
        .from('chat_history')
        .select('message, role, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: true })
        .limit(20);

      if (chatRows && chatRows.length > 0) {
        history = chatRows.map((row: any) => ({ role: row.role, content: row.message }));
      }
    }

    return NextResponse.json({
      message: { role: 'assistant', content: formattedResult || botResponse },
      functionResult,
      formattedResult,
      history,
    });

  } catch (error: any) {
    logDebug('General API Error:', error);
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