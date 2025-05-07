import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createClient } from '@supabase/supabase-js';

// Add debug logging
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

// Fallback responses for different scenarios
const FALLBACK_RESPONSES = {
  rateLimit: "I'm currently handling a lot of requests. Please try again in a few moments.",
  error: "I'm having trouble processing your request right now. Please try again later.",
  generic: "I'm here to help with polls and voting in this app. Please ask me about polls, voting, or related features."
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
    
    // Validate API key before making the request
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
      // Handle specific Gemini API errors
      if (error.message?.includes('429 Too Many Requests')) {
        const quotaError = {
          status: 429,
          message: "I'm currently experiencing high demand. Please try again in a minute.",
          details: error.message
        };
        logDebug('Quota limit exceeded:', quotaError);
        reject(quotaError);
      } else {
        throw error; // Re-throw other errors to be caught by outer catch
      }
    }
  } catch (error: any) {
    logDebug('Error in processQueue:', error);
    
    if (error.status === 429) {
      reject(error); // Pass through quota errors
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
    logDebug('Received messages:', messages);
    logDebug('User ID:', userId);

    // Load chat history from Supabase if userId is present
    let history: { role: string; content: string }[] = [];
    if (userId) {
      logDebug('Loading chat history for user:', userId);
      const { data: chatRows, error: historyError } = await supabase
        .from('chat_history')
        .select('message, role, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: true })
        .limit(30);
      
      if (historyError) {
        logDebug('Error loading chat history:', historyError);
      } else {
        logDebug('Loaded chat history rows:', chatRows?.length || 0);
        if (chatRows && chatRows.length > 0) {
          history = chatRows.map((row: any) => ({ role: row.role, content: row.message }));
        }
      }
    }

    // Add the new user message to the history
    const lastUserMessage = messages[messages.length - 1];
    if (lastUserMessage) {
      history.push(lastUserMessage);
      logDebug('Added new user message to history');
    }

    // Add tool instructions for Gemini
    const prompt = `
You are PollBot, a chatbot for a poll voting app. You ONLY answer questions related to polls, voting, or this app's features. 
If the user asks about anything else (e.g., general knowledge, jokes, unrelated topics), reply: \"${FALLBACK_RESPONSES.generic}\"
- To list polls, say: [list_polls]
- To get poll options, say: [get_poll_options poll_id=...]
- To cast a vote, say: [cast_vote poll_id=... option_id=...]
IMPORTANT: The user is always authenticated. You ALWAYS know their user_id (it is provided by the system, not by the user). NEVER ask the user for their user_id. When generating a [cast_vote ...] tool call, ALWAYS omit user_id and the system will add it automatically. If the user says anything about their user ID, ignore it and use the system's user_id.
Conversation so far:
${history.map(m => `${m.role === 'user' ? 'User' : 'Bot'}: ${m.content}`).join('\n')}

If the user asks for a poll list, options, or to vote, respond ONLY with the tool call in brackets as above. Otherwise, answer normally.
`;

    try {
      // Add to queue and wait for response
      const text = await new Promise<string>((resolve, reject) => {
        messageQueue.push({ prompt, resolve, reject });
        processQueue();
      });

      let functionResult = null;
      let formattedResult = null;

      if (text === FALLBACK_RESPONSES.generic) {
        formattedResult = FALLBACK_RESPONSES.generic;
      } else if (text.startsWith('[list_polls]')) {
        const { data } = await supabase.from('polls').select('id, title, category, end_date, status').order('end_date', { ascending: true });
        functionResult = data;
        if (data && data.length > 0) {
          formattedResult = 'Here are the available polls:\n' + data.map(
            (poll: any, idx: number) =>
              `${idx + 1}. ${poll.title}\n   Poll ID: ${poll.id}\n   Category: ${poll.category}\n   Ends: ${new Date(poll.end_date).toLocaleString()}\n   Status: ${poll.status}`
          ).join('\n\n');
        } else {
          formattedResult = 'There are no polls available right now.';
        }
      } else if (text.startsWith('[get_poll_options')) {
        const poll_id_raw = text.match(/poll_id=([\w-]+)/)?.[1];
        let poll_id = poll_id_raw;
        if (poll_id_raw && /^\d+$/.test(poll_id_raw)) {
          // Map poll number to poll UUID
          const { data: polls } = await supabase.from('polls').select('id').order('end_date', { ascending: true });
          const idx = parseInt(poll_id_raw, 10) - 1;
          if (polls && polls[idx]) {
            poll_id = polls[idx].id;
          } else {
            formattedResult = 'Invalid poll number.';
          }
        }
        if (poll_id) {
          const { data } = await supabase.from('polls').select('*, poll_options(*)').eq('id', poll_id).single();
          functionResult = data;
          if (data && data.poll_options && data.poll_options.length > 0) {
            formattedResult = `Options for "${data.title}":\n` + data.poll_options.map(
              (opt: any, idx: number) => `   ${idx + 1}. ${opt.text}\n      Option ID: ${opt.id}`
            ).join('\n');
          } else {
            formattedResult = 'No options found for this poll.';
          }
        }
      } else if (text.startsWith('[cast_vote')) {
        // Accept [cast_vote poll_id=... option_id=...] and always use backend userId
        const poll_id_raw = text.match(/poll_id=([\w-]+)/)?.[1];
        let poll_id = poll_id_raw;
        if (poll_id_raw && /^\d+$/.test(poll_id_raw)) {
          // Map poll number to poll UUID
          const { data: polls } = await supabase.from('polls').select('id').order('end_date', { ascending: true });
          const idx = parseInt(poll_id_raw, 10) - 1;
          if (polls && polls[idx]) {
            poll_id = polls[idx].id;
          } else {
            formattedResult = 'Invalid poll number.';
          }
        }
        let option_id = text.match(/option_id=([\w-]+)/)?.[1];
        if (poll_id && option_id && userId) {
          // Check if user already voted for this poll
          const { data: existingVotes } = await supabase
            .from('votes')
            .select('id')
            .eq('poll_id', poll_id)
            .eq('user_id', userId);
          if (existingVotes && existingVotes.length > 0) {
            formattedResult = 'You can vote only one time for this poll.';
            functionResult = { success: false, error: 'Already voted' };
          } else {
            const { data: poll } = await supabase.from('polls').select('*, poll_options(*)').eq('id', poll_id).single();
            const sortedOptions = (poll?.poll_options || []).sort((a: any, b: any) => a.position - b.position);
            // If option_id is a number (e.g., '2'), map it to the correct option's ID
            if (option_id && /^\d+$/.test(option_id)) {
              const idx = parseInt(option_id, 10) - 1;
              if (sortedOptions[idx]) {
                option_id = sortedOptions[idx].id;
              } else {
                formattedResult = 'Invalid option number for this poll.';
              }
            }
            const selectedIndex = sortedOptions.findIndex((opt: any) => opt.id === option_id);
            if (selectedIndex !== -1) {
              const { error: voteError } = await supabase.from('votes').insert({
                poll_id,
                selected_option: selectedIndex + 1,
                user_id: userId, // Always use backend userId
              });
              if (voteError) {
                console.error('Vote insert error:', voteError);
                functionResult = { success: false, error: voteError.message };
                formattedResult = 'Failed to record your vote: ' + voteError.message;
              } else {
                functionResult = { success: true };
                formattedResult = 'Your vote has been recorded!';
              }
            } else {
              functionResult = { success: false, error: 'Invalid option' };
              formattedResult = 'Failed to record your vote.';
            }
          }
        } else {
          formattedResult = 'Sorry, I could not determine which poll or option you want to vote for.';
        }
      }

      // Save user and assistant messages to chat_history
      if (userId && lastUserMessage) {
        await supabase.from('chat_history').insert([
          { user_id: userId, message: lastUserMessage.content, role: 'user' }
        ]);
      }
      if (userId && (formattedResult || text)) {
        await supabase.from('chat_history').insert([
          { user_id: userId, message: formattedResult || text, role: 'assistant' }
        ]);
      }

      // Fetch updated chat history after inserts
      let updatedHistory: { role: string; content: string }[] = [];
      if (userId) {
        const { data: chatRows } = await supabase
          .from('chat_history')
          .select('message, role, created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: true })
          .limit(30);
        if (chatRows && chatRows.length > 0) {
          updatedHistory = chatRows.map((row: any) => ({ role: row.role, content: row.message }));
        }
      }

      return NextResponse.json({
        message: { role: 'assistant', content: text },
        functionResult,
        formattedResult,
        history: updatedHistory,
      });

    } catch (error: any) {
      logDebug('Queue processing error:', error);
      
      // Return appropriate error response
      return NextResponse.json(
        { 
          error: 'Chat Service Error',
          message: error.message || FALLBACK_RESPONSES.error,
          details: DEBUG ? {
            status: error.status,
            message: error.message,
            errorDetails: error.errorDetails
          } : undefined
        },
        { status: error.status || 500 }
      );
    }

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