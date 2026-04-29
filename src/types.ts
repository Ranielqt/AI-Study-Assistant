export interface User {
  id: string;
  email: string;
}

export interface Chat {
  id: string;
  user_id: string;
  question: string;
  answer: string;
  created_at: string;
}

export interface Summary {
  id: string;
  user_id: string;
  file_name: string;
  file_url: string;
  summary_text: string;
  created_at: string;
}

export interface QuizQuestion {
  question: string;
  options: string[];
  correctAnswer: number;
  explanation: string;
}

export interface Quiz {
  id: string;
  user_id: string;
  topic_or_notes_ref: string;
  questions_json: QuizQuestion[];
  score: number | null;
  created_at: string;
}
