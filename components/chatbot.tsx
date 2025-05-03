'use client';
import React, { useEffect, useState, useRef } from 'react';
import { Dialog, DialogTrigger, DialogContent } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Avatar, AvatarFallback } from './ui/avatar';
import { useToast } from './ui/use-toast';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { MessageCircle } from 'lucide-react';

const BOT_NAME = 'PollBot';

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

export default function Chatbot() {
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
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
      const { message, functionResult, formattedResult, history } = await res.json();

      let newMessages = [...messages];
      if (message?.content) {
        newMessages = [...newMessages, { role: 'assistant', content: message.content }];
      }
      if (formattedResult) {
        newMessages = [...newMessages, { role: 'assistant', content: formattedResult }];
      }
      // If history is present and the last message matches the last local message, use it
      if (
        history &&
        Array.isArray(history) &&
        history.length > 0 &&
        newMessages.length > 0 &&
        history[history.length - 1].content === newMessages[newMessages.length - 1].content
      ) {
        setMessages(history);
      } else {
        setMessages(newMessages);
      }
    } catch (err) {
      toast({ title: 'Error', description: 'Failed to contact chatbot', variant: 'destructive' });
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