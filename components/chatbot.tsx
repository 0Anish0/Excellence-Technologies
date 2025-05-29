'use client';
import React, { useEffect, useState, useRef } from 'react';
import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogDescription } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Avatar, AvatarFallback } from './ui/avatar';
import { useToast } from './ui/use-toast';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { MessageCircle, Loader2, List, CheckCircle2, Users, Clock, Send, X, ChevronLeft, ChevronRight } from 'lucide-react';

const BOT_NAME = 'PollBot';
const MAX_RETRIES = 3;

// Poll creation stepper
const POLL_CREATION_STEPS = [
  { step: 'category', label: 'Choose Category' },
  { step: 'topic', label: 'Set Question' },
  { step: 'options', label: 'Add Options' },
  { step: 'confirm', label: 'Confirm' },
];

// Helper to parse poll lists/options from bot messages
function parsePolls(message: string) {
  const pollListMatch = message.match(/Here are the available polls:\n([\s\S]*)/);
  if (pollListMatch) {
    const pollsText = pollListMatch[1];
    const polls = pollsText.split(/\n\n/).map(poll => {
      const lines = poll.split('\n').map(l => l.trim());
      const title = lines[0]?.replace(/^\d+\.\s*/, '');
      const id = lines.find(l => l.startsWith('Poll ID:'))?.replace('Poll ID: ', '');
      const category = lines.find(l => l.startsWith('Category:'))?.replace('Category: ', '');
      const end = lines.find(l => l.startsWith('Ends:'))?.replace('Ends: ', '');
      const status = lines.find(l => l.startsWith('Status:'))?.replace('Status: ', '');

      return { title, id, category, end, status };
    }).filter(poll => poll.title && poll.id);

    return { type: 'polls', polls };
  }

  const optionsMatch = message.match(/Here are the options for "([^"]+)":\n([\s\S]*)/);
  if (optionsMatch) {
    const pollTitle = optionsMatch[1];
    const optionsText = optionsMatch[2];
    const options = optionsText.split('\n').map(line => {
      const match = line.trim().match(/^(\d+)\.\s(.+)$/);
      if (match) {
        const [, number, text] = match;
        const idMatch = optionsText.match(new RegExp(`${number}\\..+\\n\\s*Option ID:\\s*([\\w-]+)`));
        return { number, text, id: idMatch?.[1] || null };
      }
      return null;
    }).filter(Boolean);

    return { type: 'options', pollTitle, options };
  }

  const suggestedOptionsMatch = message.match(/Here are some suggested options for your poll "([^"]+)":\n\n([\s\S]*?)(?=\n\n|$)/);
  if (suggestedOptionsMatch) {
    const pollTitle = suggestedOptionsMatch[1];
    const optionsText = suggestedOptionsMatch[2];
    const options = optionsText.split('\n')
      .map(line => line.trim().match(/^\d+\.\s(.+)/))
      .filter(Boolean)
      .map(match => ({ number: match![0].split('.')[0], text: match![1].trim() }));

    return { type: 'suggested_options', pollTitle, options };
  }

  const resultsMatch = message.match(/Results for "([^"]+)":\n([\s\S]*)/);
  if (resultsMatch) {
    const pollTitle = resultsMatch[1];
    const resultsText = resultsMatch[2];
    const results = resultsText.split('\n')
      .filter(line => line.includes('votes'))
      .map(line => {
        const match = line.trim().match(/(.+): (\d+) votes \((\d+\.?\d*)%\)/);
        if (match) {
          return { option: match[1].trim(), votes: parseInt(match[2]), percentage: parseFloat(match[3]) };
        }
        return null;
      })
      .filter(Boolean);

    const totalVotesMatch = resultsText.match(/Total votes: (\d+)/);
    const totalVotes = totalVotesMatch ? parseInt(totalVotesMatch[1]) : 0;

    return { type: 'results', pollTitle, results, totalVotes };
  }

  return null;
}

function ChatBubble({ message, isBot }: { message: string; isBot?: boolean }) {
  const parsed = isBot ? parsePolls(message) : null;

  return (
    <div className={`flex items-end gap-2 mb-4 ${isBot ? '' : 'justify-end flex-row-reverse'}`}>
      <Avatar className="h-8 w-8 flex-shrink-0">
        <AvatarFallback className={isBot ? 'bg-primary text-primary-foreground' : 'bg-secondary'}>
          {isBot ? 'B' : 'U'}
        </AvatarFallback>
      </Avatar>
      <div
        className={`max-w-[80%] px-4 py-3 rounded-2xl shadow-sm text-sm ${
          isBot
            ? 'bg-muted text-foreground rounded-bl-none border'
            : 'bg-primary text-primary-foreground rounded-br-none'
        }`}
        style={{ wordBreak: 'break-word' }}
        aria-live={isBot ? 'polite' : undefined}
      >
        {parsed?.type === 'polls' && Array.isArray(parsed.polls) ? (
          <div>
            <div className="font-semibold mb-3 flex items-center gap-2">
              <List className="w-4 h-4 text-primary" />
              Available Polls ({parsed.polls.length})
            </div>
            <div className="space-y-3">
              {parsed.polls.map((poll, idx) => poll && (
                <div key={poll.id || idx} className="bg-white/60 dark:bg-gray-800/60 border rounded-lg p-3 shadow-sm">
                  <div className="font-medium text-primary mb-2 flex items-start gap-2">
                    <span className="bg-primary/10 text-primary px-2 py-1 rounded text-xs font-bold flex-shrink-0">
                      #{idx + 1}
                    </span>
                    <span className="flex-1">{poll.title}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Users className="w-3 h-3" />
                      {poll.category}
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      <span className={poll.status === 'active' ? 'text-green-600 font-medium' : 'text-gray-500'}>
                        {poll.status}
                      </span>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground mt-2 pt-2 border-t">
                    Ends: {poll.end}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : parsed?.type === 'options' && Array.isArray(parsed.options) ? (
          <div>
            <div className="font-semibold mb-3 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-primary" />
              Options for "{parsed.pollTitle}"
            </div>
            <div className="space-y-2">
              {parsed.options.map((opt, idx) => opt && (
                <div key={idx} className="bg-white/60 dark:bg-gray-800/60 border rounded-lg p-3 shadow-sm flex items-center gap-3">
                  <span className="bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold flex-shrink-0">
                    {opt.number}
                  </span>
                  <span className="flex-1">{opt.text}</span>
                </div>
              ))}
            </div>
          </div>
        ) : parsed?.type === 'suggested_options' && Array.isArray(parsed.options) ? (
          <div>
            <div className="font-semibold mb-3 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-primary" />
              Suggested Options for "{parsed.pollTitle}"
            </div>
            <div className="space-y-2">
              {parsed.options.map((opt, idx) => opt && (
                <div key={idx} className="bg-white/60 dark:bg-gray-800/60 border rounded-lg p-3 shadow-sm flex items-center gap-3">
                  <span className="bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold flex-shrink-0">
                    {opt.number}
                  </span>
                  <span className="flex-1">{opt.text}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 text-xs text-muted-foreground">
              Reply with the option numbers (e.g., "1, 2, 3") or provide your own with "options: [option1, option2, ...]".
            </div>
          </div>
        ) : parsed?.type === 'results' && Array.isArray(parsed.results) ? (
          <div>
            <div className="font-semibold mb-3 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-primary" />
              Results for "{parsed.pollTitle}"
            </div>
            <div className="space-y-2">
              {parsed.results.map((result, idx) => result && (
                <div key={idx} className="bg-white/60 dark:bg-gray-800/60 border rounded-lg p-3 shadow-sm">
                  <div className="flex items-center gap-3">
                    <span className="flex-1">{result.option}</span>
                    <span className="text-xs text-muted-foreground">
                      {result.votes} votes ({result.percentage}%)
                    </span>
                  </div>
                  <div className="mt-2 bg-gray-200 dark:bg-gray-700 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-primary h-full"
                      style={{ width: `${result.percentage}%` }}
                    ></div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 text-xs text-muted-foreground">
              Total votes: {parsed.totalVotes}
            </div>
          </div>
        ) : (
          <div className="whitespace-pre-wrap">{message}</div>
        )}
      </div>
    </div>
  );
}

// Enhanced intent detection helper
function detectUserIntent(message: string, currentPollStep: string | null): string {
  const msg = message.toLowerCase().trim();

  if (msg.match(/\b(create|make|add|new|lets create)\b.*\bpoll\b/i)) {
    return 'create_poll';
  }

  if (currentPollStep === 'category' && 
     (msg.match(/\b(technology|politics|entertainment|other)\b/i) || msg.includes('category:'))) {
    return 'category_selection';
  }

  if (currentPollStep === 'topic' && 
     (msg.length > 10 || msg.endsWith('?'))) {
    return 'topic_input';
  }

  if (currentPollStep === 'options' && 
     (msg.includes(',') || msg.split(/\s+/).length <= 6)) {
    return 'options_input';
  }

  if (msg.includes('confirm') && currentPollStep === 'confirm') {
    return 'confirm_poll';
  }

  if (msg.includes('cancel') || msg.includes('restart')) {
    return 'cancel_poll';
  }

  if (msg.match(/\b(show|list|display)\b.*\bpolls?\b/i)) {
    return 'show_polls';
  }

  return 'general';
}

export default function Chatbot({ onVoteSuccess }: { onVoteSuccess?: () => void }) {
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [pollCreationStep, setPollCreationStep] = useState<string | null>(null);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const { toast } = useToast();
  const supabase = createClientComponentClient();
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load user data on mount
  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      
      // Try to restore poll creation state from localStorage
      if (user) {
        try {
          const savedState = localStorage.getItem(`pollbot_state_${user.id}`);
          if (savedState) {
            const { step } = JSON.parse(savedState);
            if (step) {
              setPollCreationStep(step);
            }
          }
        } catch (e) {
          console.error('Error restoring poll creation state:', e);
        }
      }
    };

    getUser();
  }, [supabase.auth]);

  // Save poll creation state to localStorage when it changes
  useEffect(() => {
    if (user && pollCreationStep) {
      try {
        localStorage.setItem(`pollbot_state_${user.id}`, JSON.stringify({ 
          step: pollCreationStep,
          lastUpdated: new Date().toISOString()
        }));
      } catch (e) {
        console.error('Error saving poll creation state:', e);
      }
    } else if (user && !pollCreationStep) {
      // Clean up localStorage when poll creation is complete
      localStorage.removeItem(`pollbot_state_${user.id}`);
    }
  }, [user, pollCreationStep]);

  // Separate useEffect for loading chat history when dialog opens
  useEffect(() => {
    const loadChatHistory = async () => {
      if (!user || !open) return;
      
      // Skip if we've already loaded history and haven't requested a refresh
      if (historyLoaded && messages.length > 0) return;
      
      try {
        setLoading(true);
        console.log('Loading chat history for user:', user.id);
        
        // Clear any potentially stale poll creation state that might be causing issues
        const oldState = localStorage.getItem(`pollbot_state_${user.id}`);
        if (oldState) {
          try {
            const parsed = JSON.parse(oldState);
            const lastUpdated = new Date(parsed.lastUpdated);
            const now = new Date();
            // If the state is older than 24 hours, clear it
            if (now.getTime() - lastUpdated.getTime() > 24 * 60 * 60 * 1000) {
              localStorage.removeItem(`pollbot_state_${user.id}`);
              setPollCreationStep(null);
            }
          } catch (e) {
            console.error('Error parsing saved state:', e);
            localStorage.removeItem(`pollbot_state_${user.id}`);
          }
        }
        
        // Add a cache-busting parameter to avoid browser caching
        const cacheBuster = Date.now();
        const res = await fetch(`/api/chat?_=${cacheBuster}`, {
          method: 'POST',
          body: JSON.stringify({ messages: [], userId: user.id }),
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' }
        });

        if (res.ok) {
          const { history } = await res.json();
          if (history && Array.isArray(history) && history.length > 0) {
            console.log(`Received ${history.length} messages from server`);
            console.log('First message:', history[0]?.content.substring(0, 30));
            console.log('Last message:', history[history.length - 1]?.content.substring(0, 30));
            
            // Set the messages with timestamps
            setMessages(history.map(msg => ({
              ...msg,
              timestamp: new Date().toISOString()
            })));
            setHistoryLoaded(true);
            
            // Determine poll creation step from history
            const botMessages = history.filter(msg => msg.role === 'assistant');
            const lastBotMessage = botMessages[botMessages.length - 1]?.content;
            updatePollCreationStep(lastBotMessage);
          } else {
            console.log('No history received from server');
            // Set welcome message if no history exists
            setMessages([{
              role: 'assistant',
              content: `Hi! I'm ${BOT_NAME}, your friendly assistant for polls and voting! 🗳️\n\nI can help you with:\n• Viewing available polls\n• Voting on polls\n• Checking your voting status\n${user.role === 'admin' ? '• Creating new polls\n• Editing polls' : ''}\n\nWhat would you like to do today?`,
              timestamp: new Date().toISOString()
            }]);
            setHistoryLoaded(true);
          }
        } else {
          console.error('Error response from server:', res.status);
        }
      } catch (error) {
        console.error('Error loading chat history:', error);
        // Fallback welcome message
        setMessages([{
          role: 'assistant',
          content: `Hi! I'm ${BOT_NAME}, your friendly assistant for polls and voting! 🗳️\n\nWhat can I help you with today?`,
          timestamp: new Date().toISOString()
        }]);
      } finally {
        setLoading(false);
      }
    };

    loadChatHistory();
  }, [user, open, historyLoaded]);

  // Reset history loaded state when dialog closes
  useEffect(() => {
    if (!open) {
      setHistoryLoaded(false);
      setMessages([]); // Clear messages when dialog closes to ensure fresh load
    }
  }, [open]);

  // Helper function to update poll creation step
  const updatePollCreationStep = (message?: string) => {
    if (!message) return;
    
    if (message.includes('choose a category for your poll')) {
      setPollCreationStep('category');
    } else if (message.includes('provide the main topic or question')) {
      setPollCreationStep('topic');
    } else if (message.includes('add some options for your poll') || message.includes('suggested options for your poll')) {
      setPollCreationStep('options');
    } else if (message.includes('Here\'s a summary of your poll')) {
      setPollCreationStep('confirm');
    } else if (message.includes('Poll created successfully')) {
      setPollCreationStep(null);
    }
  };

  // Update poll creation step based on messages
  useEffect(() => {
    const lastBotMessage = messages.filter(m => m.role === 'assistant').slice(-1)[0]?.content;
    updatePollCreationStep(lastBotMessage);
  }, [messages]);

  useEffect(() => {
    if (open) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [open]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const addMessage = (msg: { role: string; content: string }) => {
    setMessages((msgs) => [...msgs, { ...msg, timestamp: new Date().toISOString() }]);
  };

  // Handle a completed poll (add this to the completion handler)
  const handlePollComplete = () => {
    setPollCreationStep(null);
    if (user) {
      localStorage.removeItem(`pollbot_state_${user.id}`);
    }
  };

  // Update the handleSend function to check for poll completion
  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;

    setInput('');
    
    // Detect if we should format the message
    const userIntent = detectUserIntent(text, pollCreationStep);
    
    // Format message for better server understanding if needed
    let formattedMessage = text;
    
    if (userIntent === 'category_selection' && !text.includes('category:') && 
        ['technology', 'politics', 'entertainment', 'other'].some(
          cat => text.toLowerCase().includes(cat.toLowerCase())
        )) {
      // Extract the category
      const category = ['technology', 'politics', 'entertainment', 'other'].find(
        cat => text.toLowerCase().includes(cat.toLowerCase())
      );
      formattedMessage = `category: ${category}`;
    }
    
    addMessage({ role: 'user', content: formattedMessage });
    setLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        body: JSON.stringify({
          messages: [
            ...messages,
            { role: 'user', content: formattedMessage }
          ],
          userId: user?.id
        }),
        headers: { 'Content-Type': 'application/json' }
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 429) {
          if (retryCount < MAX_RETRIES) {
            setRetryCount(prev => prev + 1);
            toast({
              title: "Rate Limited",
              description: "Too many requests. Retrying in a moment...",
              variant: "destructive",
            });
            setTimeout(() => handleSend(), 2000);
            return;
          } else {
            throw new Error(data.message || 'Rate limit exceeded. Please try again later.');
          }
        }
        throw new Error(data.message || 'Failed to send message');
      }

      setRetryCount(0);

      if (data.message && data.message.content) {
        addMessage(data.message);

        // Check for poll creation success and handle it
        if (data.message.content.includes('Poll created successfully')) {
          handlePollComplete();
        }
        
        if (data.functionResult?.success && onVoteSuccess) {
          onVoteSuccess();
        }
      }

    } catch (error: any) {
      console.error('Chat error:', error);
      addMessage({
        role: 'assistant',
        content: error.message || 'Sorry, I encountered an error. Please try again.'
      });
      toast({
        title: "Error",
        description: error.message || "Failed to send message. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Enhanced quick action handler
  const handleQuickAction = (action: string) => {
    // For continue/previous poll creation
    if (action === 'continue poll' && pollCreationStep) {
      const continueMessage = "continue with previous poll creation";
      setInput(continueMessage);
      setTimeout(() => {
        handleSend();
      }, 100);
      return;
    }
    
    setInput(action);
    setTimeout(() => {
      handleSend();
    }, 100);
  };

  const handleOptionSelect = (optionNumbers: string[]) => {
    const text = `options: ${optionNumbers.join(', ')}`;
    setInput(text);
    setTimeout(() => {
      handleSend();
    }, 100);
  };

  // Add this function at the right spot
  const refreshChatHistory = () => {
    setHistoryLoaded(false);
    setMessages([]);
    toast({
      title: "Refreshing",
      description: "Refreshing chat history...",
    });
  };

  // Update the quick actions section to include a refresh button
  const renderQuickActions = () => {
    return (
      <div className="px-4 py-2 border-t bg-muted/30">
        <p className="text-xs text-muted-foreground mb-2">Quick actions:</p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleQuickAction('show polls')}
            className="text-xs"
            disabled={loading}
          >
            Show Polls
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleQuickAction('show recent 3 polls')}
            className="text-xs"
            disabled={loading}
          >
            Recent Polls
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleQuickAction('show polls I voted on')}
            className="text-xs"
            disabled={loading}
          >
            My Votes
          </Button>
          {user.role === 'admin' && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleQuickAction('create a poll')}
                className="text-xs"
                disabled={loading}
              >
                Create Poll
              </Button>
              {pollCreationStep && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleQuickAction('continue poll')}
                  className="text-xs bg-primary/10"
                  disabled={loading}
                >
                  Continue Poll
                </Button>
              )}
            </>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleQuickAction('help')}
            className="text-xs"
            disabled={loading}
          >
            Help
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={refreshChatHistory}
            className="text-xs ml-auto"
            disabled={loading}
          >
            Refresh
          </Button>
        </div>
      </div>
    );
  };

  if (!user) {
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="fixed bottom-4 right-4 h-12 w-12 rounded-full shadow-lg hover:shadow-xl transition-all duration-200 bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <MessageCircle className="h-5 w-5" />
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogTitle>Chat with {BOT_NAME}</DialogTitle>
          <DialogDescription>
            Please sign in to use the chatbot feature.
          </DialogDescription>
          <div className="text-center py-8">
            <MessageCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">Sign in to start chatting with {BOT_NAME}</p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="fixed bottom-4 right-4 h-12 w-12 rounded-full shadow-lg hover:shadow-xl transition-all duration-200 bg-primary text-primary-foreground hover:bg-primary/90 z-50"
        >
          <MessageCircle className="h-5 w-5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[100%] h-[90vh] max-w-[1250px] flex flex-col p-0">
        <div className="flex items-center justify-between p-4 border-b bg-primary text-primary-foreground">
          <div className="flex items-center gap-2">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="bg-primary-foreground text-primary">B</AvatarFallback>
            </Avatar>
            <div>
              <DialogTitle className="text-sm font-semibold">{BOT_NAME}</DialogTitle>
              <DialogDescription className="text-xs text-primary-foreground/80">
                Your polling assistant
              </DialogDescription>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setOpen(false)}
            className="text-primary-foreground hover:bg-primary-foreground/20"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {pollCreationStep && (
          <div className="p-4 border-b bg-muted/30">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold">Poll Creation Progress</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleQuickAction('restart poll creation')}
                className="text-xs"
              >
                Restart
              </Button>
            </div>
            <div className="flex items-center gap-2">
              {POLL_CREATION_STEPS.map((step, idx) => (
                <React.Fragment key={step.step}>
                  <div className="flex items-center gap-1">
                    <span
                      className={`text-xs font-medium ${
                        pollCreationStep === step.step ? 'text-primary' : 'text-muted-foreground'
                      }`}
                    >
                      {step.label}
                    </span>
                    {idx < POLL_CREATION_STEPS.length - 1 && (
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    )}
                  </div>
                </React.Fragment>
              ))}
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gradient-to-b from-background to-muted/20">
          {messages.map((msg, idx) => (
            <ChatBubble
              key={idx}
              message={msg.content}
              isBot={msg.role === 'assistant'}
            />
          ))}

          {loading && (
            <div className="flex items-end gap-2 mb-4">
              <Avatar className="h-8 w-8 flex-shrink-0">
                <AvatarFallback className="bg-primary text-primary-foreground">B</AvatarFallback>
              </Avatar>
              <div className="bg-muted text-foreground px-4 py-3 rounded-2xl rounded-bl-none border">
                <div className="flex items-center gap-1">
                  <div className="flex space-x-1">
                    <div className="w-2 h-2 bg-primary rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                    <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                  </div>
                  <span className="text-xs text-muted-foreground ml-2">{BOT_NAME} is typing...</span>
                </div>
              </div>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {renderQuickActions()}

        <div className="p-4 border-t bg-background/95 backdrop-blur">
          <form onSubmit={handleSend} className="flex gap-2">
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={pollCreationStep === 'category' 
                ? "Enter a category (Technology, Politics, Entertainment, Other)" 
                : pollCreationStep === 'topic'
                ? "Enter your poll question"
                : pollCreationStep === 'options'
                ? "Enter options separated by commas"
                : pollCreationStep === 'confirm'
                ? "Type 'confirm' to create poll or 'cancel'"
                : "Ask me about polls, voting, or anything else..."}
              disabled={loading}
              className="flex-1"
              maxLength={500}
            />
            <Button
              type="submit"
              disabled={loading || !input.trim()}
              size="sm"
              className="px-3"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </form>
          <p className="text-xs text-muted-foreground mt-2 text-center">
            {pollCreationStep
              ? `Poll Creation - Step: ${POLL_CREATION_STEPS.find(s => s.step === pollCreationStep)?.label || pollCreationStep}`
              : `${BOT_NAME} can help you view polls, vote, check your voting status, or create polls (admin only).`}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}