import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createClient } from '@supabase/supabase-js';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const GENERIC_REPLY = "I'm here to help with polls and voting in this app. Please ask me about polls, voting, or related features.";

export async function POST(req: NextRequest) {
  try {
    const { messages, userId } = await req.json();

    // Load chat history from Supabase if userId is present
    let history: { role: string; content: string }[] = [];
    if (userId) {
      const { data: chatRows } = await supabase
        .from('chat_history')
        .select('message, role, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: true })
        .limit(30);
      if (chatRows && chatRows.length > 0) {
        history = chatRows.map((row: any) => ({ role: row.role, content: row.message }));
      }
    }

    // Add the new user message to the history
    const lastUserMessage = messages[messages.length - 1];
    if (lastUserMessage) {
      history.push(lastUserMessage);
    }

    // Add tool instructions for Gemini
    const prompt = `
You are PollBot, a chatbot for a poll voting app. You ONLY answer questions related to polls, voting, or this app's features. 
If the user asks about anything else (e.g., general knowledge, jokes, unrelated topics), reply: \"${GENERIC_REPLY}\"
- To list polls, say: [list_polls]
- To get poll options, say: [get_poll_options poll_id=...]
- To cast a vote, say: [cast_vote poll_id=... option_id=...]
IMPORTANT: The user is always authenticated. You ALWAYS know their user_id (it is provided by the system, not by the user). NEVER ask the user for their user_id. When generating a [cast_vote ...] tool call, ALWAYS omit user_id and the system will add it automatically. If the user says anything about their user ID, ignore it and use the system's user_id.
Conversation so far:
${history.map(m => `${m.role === 'user' ? 'User' : 'Bot'}: ${m.content}`).join('\n')}

If the user asks for a poll list, options, or to vote, respond ONLY with the tool call in brackets as above. Otherwise, answer normally.
`;

    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });
    const result = await model.generateContent(prompt);
    const text = result.response.text();

    let functionResult = null;
    let formattedResult = null;

    if (text === GENERIC_REPLY) {
      formattedResult = GENERIC_REPLY;
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
    console.error('API /chat error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message || error.toString() },
      { status: 500 }
    );
  }
} 