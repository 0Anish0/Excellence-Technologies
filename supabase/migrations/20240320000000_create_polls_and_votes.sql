-- Create polls table
CREATE TABLE IF NOT EXISTS polls (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  option1 TEXT NOT NULL,
  option2 TEXT NOT NULL,
  option3 TEXT NOT NULL,
  option4 TEXT NOT NULL,
  file_url TEXT,
  file_type TEXT,
  extracted_text TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create votes table
CREATE TABLE IF NOT EXISTS votes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  poll_id UUID NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  selected_option INTEGER NOT NULL CHECK (selected_option BETWEEN 1 AND 4),
  voted_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(poll_id, user_id)
);

-- Enable Row Level Security (RLS)
ALTER TABLE polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE votes ENABLE ROW LEVEL SECURITY;

-- Create policies for polls table
CREATE POLICY "Allow users to create polls"
  ON polls FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Allow users to view all polls"
  ON polls FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow users to update their own polls"
  ON polls FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Allow users to delete their own polls"
  ON polls FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create policies for votes table
CREATE POLICY "Allow users to vote"
  ON votes FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Allow users to view all votes"
  ON votes FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow users to update their own votes"
  ON votes FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Allow users to delete their own votes"
  ON votes FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create storage bucket for poll files
INSERT INTO storage.buckets (id, name, public) VALUES ('poll-files', 'poll-files', true);

-- Create storage policy for poll files
CREATE POLICY "Allow users to upload poll files"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'poll-files' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Allow users to view poll files"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'poll-files');

CREATE POLICY "Allow users to delete their own poll files"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'poll-files' AND auth.uid()::text = (storage.foldername(name))[1]); 