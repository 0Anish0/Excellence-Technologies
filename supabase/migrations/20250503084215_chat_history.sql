-- Migration for chat_history table
CREATE TABLE IF NOT EXISTS chat_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  message text NOT NULL,
  role text NOT NULL, -- 'user' or 'assistant'
  created_at timestamp with time zone DEFAULT timezone('utc', now())
);

-- Index for fast lookup by user
CREATE INDEX IF NOT EXISTS idx_chat_history_user_id ON chat_history(user_id);
