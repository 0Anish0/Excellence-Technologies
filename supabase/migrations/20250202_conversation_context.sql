-- Create conversation context table for storing conversation state
CREATE TABLE IF NOT EXISTS conversation_context (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    current_state JSONB,
    session_data JSONB DEFAULT '{}',
    entities JSONB DEFAULT '{}',
    last_intent JSONB,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add RLS policies
ALTER TABLE conversation_context ENABLE ROW LEVEL SECURITY;

-- Users can only access their own conversation context
CREATE POLICY "Users can view own conversation context" ON conversation_context
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own conversation context" ON conversation_context
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own conversation context" ON conversation_context
    FOR UPDATE USING (auth.uid() = user_id);

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_conversation_context_updated_at ON conversation_context(updated_at);

-- Add trigger to update updated_at
CREATE OR REPLACE FUNCTION update_conversation_context_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_conversation_context_updated_at
    BEFORE UPDATE ON conversation_context
    FOR EACH ROW
    EXECUTE FUNCTION update_conversation_context_updated_at(); 