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
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  description TEXT
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

-- Create storage bucket for poll files if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('poll-files', 'poll-files', true)
ON CONFLICT (id) DO NOTHING;

-- Create storage policy for poll files
CREATE POLICY "Allow authenticated users to upload poll files"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'poll-files');

CREATE POLICY "Allow authenticated users to view poll files"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'poll-files');

CREATE POLICY "Allow users to delete their own poll files"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'poll-files' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Add role column to auth.users
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user';

-- Create function to check if user is admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to check if user owns a poll
CREATE OR REPLACE FUNCTION owns_poll(poll_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM polls
    WHERE id = poll_id AND user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update storage policies
DROP POLICY IF EXISTS "Allow authenticated users to upload poll files" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated users to view poll files" ON storage.objects;
DROP POLICY IF EXISTS "Allow users to delete their own poll files" ON storage.objects;

CREATE POLICY "Allow authenticated users to upload poll files"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'poll-files');

CREATE POLICY "Allow authenticated users to view poll files"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'poll-files');

CREATE POLICY "Allow users to delete their own poll files"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'poll-files' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  ); 