# AI Study Assistant

A personalized study companion built with React, Supabase, and Google Gemini AI.

## Features
- **AI Chatbot Tutor**: Real-time study assistance with persistent chat history.
- **Smart Summarizer**: Upload notes (.txt, .md, .pdf) to get concise AI-generated summaries.
- **Quiz Generator**: Generate custom quizzes from your notes or any topic.
- **Smart Recommendations**: Get study suggestions based on your recent queries.
- **Secure Auth**: User accounts powered by Supabase Auth with RLS.

## Tech Stack
- **Frontend**: React 19, TypeScript, Tailwind CSS, Motion
- **Backend/DB**: Supabase (PostgreSQL, Storage, Auth)
- **AI**: Google Gemini (via `@google/genai`)

## Supabase Setup Instructions

To get this app running, you need to set up a Supabase project:

1. **Create a Project**: Go to [supabase.com](https://supabase.com) and create a new project.
2. **Auth Setup**: 
   - Enable **Email/Password** provider in the Authentication settings.
3. **Database Tables**: Run the following SQL in the SQL Editor:

```sql
-- Chats table
CREATE TABLE chats (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Summaries table
CREATE TABLE summaries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  summary_text TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Quizzes table
CREATE TABLE quizzes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  topic_or_notes_ref TEXT NOT NULL,
  questions_json JSONB NOT NULL,
  score INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE quizzes ENABLE ROW LEVEL SECURITY;

-- Create Policies
CREATE POLICY "Users can only see their own chats" ON chats FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can only see their own summaries" ON summaries FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can only see their own quizzes" ON quizzes FOR ALL USING (auth.uid() = user_id);
```

4. **Storage Setup**:
   - Create a new **Public** bucket named `notes`.
   - Add a policy to allow authenticated users to:
     - `INSERT` to `notes` if `auth.uid() = (storage.foldername(name))[1]`
     - `SELECT` from `notes` if `auth.uid() = (storage.foldername(name))[1]`

5. **API Keys**:
   - Copy your **Project URL** and **Anon Key** from Project Settings -> API.
   - Add them to your environment variables:
     - `VITE_SUPABASE_URL`
     - `VITE_SUPABASE_ANON_KEY`

## Deployment

### Vercel
1. Connect your GitHub repository to Vercel.
2. Add the environment variables:
   - `GEMINI_API_KEY` (from Google AI Studio)
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3. Deploy!

### Local Development
```bash
npm install
npm run dev
```
