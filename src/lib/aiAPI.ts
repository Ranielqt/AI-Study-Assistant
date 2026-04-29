import { GoogleGenAI, Type } from "@google/genai";
import { QuizQuestion } from "../types";

let aiInstance: GoogleGenAI | null = null;

export function getAI() {
  if (!aiInstance) {
    // Try to get apiKey from multiple possible sources in Vite/Node
    const apiKey = 
      (import.meta as any).env?.VITE_GEMINI_API_KEY || 
      (typeof process !== 'undefined' ? process.env?.GEMINI_API_KEY : '') ||
      (typeof window !== 'undefined' ? (window as any).VITE_GEMINI_API_KEY : '');
    
    if (!apiKey || apiKey === 'your_actual_gemini_api_key_here') {
      throw new Error("GEMINI_API_KEY is missing. If running locally: \n1. Add VITE_GEMINI_API_KEY=your_key to your .env file\n2. RESTART your dev server (npm run dev)");
    }
    aiInstance = new GoogleGenAI({ apiKey });
  }
  return aiInstance;
}

export interface FilePart {
  inlineData: {
    data: string;
    mimeType: string;
  };
}

export const generateStudyResponse = async (
  question: string, 
  history: { role: "user" | "model", parts: { text: string }[] }[],
  file?: { data: string, mimeType: string }
) => {
  const model = "gemini-2.0-flash";
  const ai = getAI();
  
  const contents = [...history];
  const currentParts: any[] = [{ text: question }];
  
  if (file) {
    currentParts.push({
      inlineData: {
        data: file.data.split(',')[1] || file.data,
        mimeType: file.mimeType
      }
    });
  }
  
  contents.push({ role: "user", parts: currentParts });

  const response = await ai.models.generateContent({
    model,
    contents,
    config: {
      systemInstruction: `You are a helpful AI Study Assistant. Today's date is ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} and the current time is ${new Date().toLocaleTimeString()}. Answer the student's questions clearly and concisely. Use markdown formatting for readability. If a file is attached, analyze its content to provide the best answer.`,
    },
  });

  return response.text || "I'm sorry, I couldn't generate a response at this time.";
};

export const summarizeNotes = async (fileName: string, fileData?: { data: string, mimeType: string }, textContent?: string) => {
  const ai = getAI();
  const model = "gemini-2.0-flash";
  
  const parts: any[] = [
    { text: `Summarize the following notes from the file "${fileName}" in 100-200 words. Focus on key concepts and main takeaways.` }
  ];

  if (fileData) {
    parts.push({
      inlineData: {
        data: fileData.data.split(',')[1] || fileData.data,
        mimeType: fileData.mimeType
      }
    });
  } else if (textContent) {
    parts.push({ text: `Content:\n${textContent}` });
  }

  const response = await ai.models.generateContent({
    model,
    contents: [{ role: "user", parts }],
    config: {
      systemInstruction: "You are an expert at academic summarization. Provide a clear, bulleted summary of the provided text/file.",
    },
  });

  return response.text || "Unable to generate summary for this file.";
};

export const generateQuiz = async (topicOrContent: string, file?: { data: string, mimeType: string }): Promise<QuizQuestion[]> => {
  const ai = getAI();
  const model = "gemini-2.0-flash";
  
  const parts: any[] = [{ 
    text: `Generate 5 multiple-choice questions based on the following topic or content: "${topicOrContent}". 
    Each question should have exactly 4 options. 
    Include a brief explanation for the correct answer.` 
  }];

  if (file) {
    parts.push({
      inlineData: {
        data: file.data.split(',')[1] || file.data,
        mimeType: file.mimeType
      }
    });
  }

  const response = await ai.models.generateContent({
    model,
    contents: [{ 
      role: "user", 
      parts
    }],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            question: { type: Type.STRING },
            options: { 
              type: Type.ARRAY, 
              items: { type: Type.STRING },
              minItems: 4,
              maxItems: 4
            },
            correctAnswer: { type: Type.INTEGER, description: "Index of the correct option (0-3)" },
            explanation: { type: Type.STRING }
          },
          required: ["question", "options", "correctAnswer", "explanation"]
        }
      }
    }
  });

  const text = response.text;
  if (!text) throw new Error("Failed to generate quiz");
  return JSON.parse(text);
};

export const getSmartRecommendations = async (chatHistory: string[]) => {
  if (chatHistory.length < 3) return [];

  const ai = getAI();
  const model = "gemini-2.0-flash";
  
  const response = await ai.models.generateContent({
    model,
    contents: [{
      role: "user",
      parts: [{ text: `Based on these recent student queries: ${chatHistory.join(", ")}. 
      Suggest 3 relevant follow-up questions or study topics the student might be interested in.` }]
    }],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: { type: Type.STRING }
      }
    }
  });

  const text = response.text;
  if (!text) return [];
  return JSON.parse(text);
};
