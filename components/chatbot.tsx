'use client';
import React, { useEffect, useState, useRef } from 'react';
import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogDescription } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Avatar, AvatarFallback } from './ui/avatar';
import { useToast } from './ui/use-toast';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { MessageCircle } from 'lucide-react';

const BOT_NAME = 'PollBot';
const MAX_RETRIES = 1; // Only retry once

function ChatBubble({ message, isBot }: { message: string; isBot?: boolean }) {
  return (
    <div className={`flex items-end gap-2 mb-3 ${isBot ? '' : 'justify-end flex-row-reverse'}`}>
      <Avatar className="h-8 w-8">
        <AvatarFallback>{isBot ? 'B' : 'U'}</AvatarFallback>
      </Avatar>
      <div
        className={`max-w-xs px-4 py-2 rounded-2xl shadow-md text-sm whitespace-pre-line ${
          isBot
            ? 'bg-muted text-foreground rounded-bl-none'
            : 'bg-primary text-primary-foreground rounded-br-none'
        }`}
      >
        {message}
      </div>
    </div>
  );
}

export default function Chatbot({ onVoteSuccess }: { onVoteSuccess?: () => void }) {
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const { toast } = useToast();
  const supabase = createClientComponentClient();
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Fetch user and chat history on mount
  useEffect(() => {
    const getUserAndHistory = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      if (user) {
        // Fetch chat history from backend
        const res = await fetch('/api/chat', {
          method: 'POST',
          body: JSON.stringify({ messages: [], userId: user.id }),
          headers: { 'Content-Type': 'application/json' }
        });
        const { history } = await res.json();
        if (history && Array.isArray(history) && history.length > 0) {
          setMessages(history);
        } else {
          setMessages([{ role: 'assistant', content: `Hi! I'm ${BOT_NAME}. Ask me anything about polls.` }]);
        }
      }
    };
    getUserAndHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open]);

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const text = input.trim();
    if (!text) return;
    setInput('');
    setMessages((msgs) => [...msgs, { role: 'user', content: text }]);
    setLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        body: JSON.stringify({
          messages: [
            ...messages,
            { role: 'user', content: text }
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
              title: 'High Demand',
              description: 'The service is busy. Retrying in a minute...',
              duration: 3000
            });
            setTimeout(() => handleSend(), 60000); // 1 minute
            return;
          } else {
            // After max retries, show generic error and stop
            const errorMessage = "Sorry, we're currently experiencing high demand. Please try again later.";
            toast({
              title: 'Service Busy',
              description: errorMessage,
              variant: 'destructive'
            });
            setMessages(prev => [...prev, {
              role: 'assistant',
              content: errorMessage
            }]);
            setRetryCount(0); // Reset for next user message
            setLoading(false);
            return;
          }
        }

        // Show error message from the server
        const errorMessage = data.message || 'Failed to get response';
        toast({
          title: 'Error',
          description: errorMessage,
          variant: 'destructive'
        });

        setMessages(prev => [...prev, {
          role: 'assistant',
          content: errorMessage
        }]);
        setLoading(false);
        return;
      }

      setRetryCount(0); // Reset retry count on success

      let newMessages = [...messages];
      if (data.message?.content) {
        newMessages = [...newMessages, { role: 'assistant', content: data.message.content }];
      }
      if (data.formattedResult) {
        newMessages = [...newMessages, { role: 'assistant', content: data.formattedResult }];
      }
      if (
        data.history &&
        Array.isArray(data.history) &&
        data.history.length > 0 &&
        newMessages.length > 0 &&
        data.history[data.history.length - 1].content === newMessages[newMessages.length - 1].content
      ) {
        setMessages(data.history);
      } else {
        setMessages(newMessages);
      }

      // Call onVoteSuccess if the vote was recorded
      if (
        (data.formattedResult && data.formattedResult.toLowerCase().includes('your vote has been recorded')) ||
        (data.message?.content && data.message.content.toLowerCase().includes('your vote has been recorded'))
      ) {
        if (onVoteSuccess) onVoteSuccess();
      }
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to contact chatbot';
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive'
      });

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: errorMessage
      }]);
    } finally {
      setLoading(false);
    }
  };

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          className="fixed bottom-6 right-6 z-50 rounded-full shadow-lg h-14 w-14 flex items-center justify-center bg-primary text-primary-foreground hover:bg-primary/90"
          size="icon"
          aria-label="Open chatbot"
        >
          <MessageCircle className="h-7 w-7" />
        </Button>
      </DialogTrigger>
      <DialogContent className="p-0 max-w-md w-full rounded-2xl overflow-hidden flex flex-col">
        <DialogTitle className="sr-only">Chat with PollBot</DialogTitle>
        <DialogDescription className="sr-only">
          Chat interface for interacting with PollBot about polls and voting
        </DialogDescription>
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b bg-primary/90">
          <Avatar className="h-9 w-9">
            <AvatarFallback>B</AvatarFallback>
          </Avatar>
          <span className="font-semibold text-lg text-primary-foreground">{BOT_NAME}</span>
        </div>
        {/* Chat body */}
        <div className="flex-1 overflow-y-auto px-4 py-3 bg-background" style={{ minHeight: 320, maxHeight: 400 }}>
          {messages.map((msg, idx) => (
            <ChatBubble key={idx} message={msg.content} isBot={msg.role === 'assistant'} />
          ))}
          <div ref={chatEndRef} />
        </div>
        {/* Input */}
        <form
          onSubmit={handleSend}
          className="flex items-center gap-2 border-t bg-background px-4 py-3"
        >
          <Input
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Type a message..."
            disabled={loading}
            className="flex-1"
            autoFocus
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) handleSend(e); }}
          />
          <Button type="submit" disabled={loading || !input.trim()} className="h-10 px-4">Send</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
} 