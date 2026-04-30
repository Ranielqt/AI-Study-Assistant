import { GoogleGenAI } from "@google/genai";
import { QuizQuestion } from "../types";

let aiInstance: GoogleGenAI | null = null;

export function getAI() {
  if (!aiInstance) {
    // Check for VITE_ prefix (standard for Vite/Vercel client) first, then fallback to platform key
    const apiKey = (import.meta as any).env?.VITE_GEMINI_API_KEY || (process as any).env?.GEMINI_API_KEY;
                   
    if (!apiKey) {
      console.warn("GEMINI_API_KEY or VITE_GEMINI_API_KEY is missing. AI features will fail.");
    }
    aiInstance = new GoogleGenAI({ apiKey: apiKey || "" });
  }
  return aiInstance;
}

const MODEL_TO_USE = "gemini-1.5-flash";

/**
 * Cap history to avoid hitting Token limits.
 */
const capHistory = (history: any[]) => {
  if (history.length > 20) {
    return history.slice(-20);
  }
  return history;
};

export const generateStudyResponse = async (
  question: string, 
  history: any[],
  file?: { data: string, mimeType: string }
) => {
  try {
    const ai = getAI();
    
    const parts: any[] = [{ text: question }];
    if (file) {
      parts.push({
        inlineData: {
          data: file.data.split(',')[1] || file.data,
          mimeType: file.mimeType
        }
      });
    }
    
    // Format history exactly as expected by @google/genai
    const contents = history.map(h => ({
      role: h.role,
      parts: h.parts.map((p: any) => ({ text: p.text }))
    }));
    
    contents.push({ role: "user", parts });

    const genModel = ai.getGenerativeModel({
      model: MODEL_TO_USE,
      systemInstruction: "You are a helpful AI Study Assistant. Keep responses focused and readable.",
    });

    const result = await genModel.generateContent({
      contents,
    });

    return result.response.text();
  } catch (err: any) {
    console.error("AI SDK Error:", err);
    throw err;
  }
};

export const generateChatStream = async (
  question: string,
  history: any[],
  file?: { data: string, mimeType: string }
) => {
  try {
    const ai = getAI();

    const parts: any[] = [{ text: question || (file ? "Analyze this file." : "") }];
    if (file) {
      parts.push({
        inlineData: {
          data: file.data.split(',')[1] || file.data,
          mimeType: file.mimeType
        }
      });
    }

    const contents = capHistory(history).map(h => ({
      role: h.role,
      parts: h.parts.map((p: any) => ({ text: p.text }))
    }));

    contents.push({ role: "user", parts });

    const genModel = ai.getGenerativeModel({
      model: MODEL_TO_USE,
      systemInstruction: "You are a helpful AI Study Assistant. Help the student understand their material. Use markdown.",
    });

    return await genModel.generateContentStream({
      contents,
    });
  } catch (err: any) {
    console.error("AI Stream SDK Error:", err);
    throw err;
  }
};

export const summarizeNotes = async (fileName: string, fileData?: { data: string, mimeType: string }, textContent?: string) => {
  try {
    const ai = getAI();
    
    const parts: any[] = [
      { text: `Summarize the following notes from "${fileName}" in 100-200 words. Key takeaways only.` }
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

    const genModel = ai.getGenerativeModel({
      model: MODEL_TO_USE,
    });

    const result = await genModel.generateContent({
      contents: [{ role: "user", parts }]
    });

    return result.response.text();
  } catch (err) {
    console.error("Summarize Error:", err);
    return "Could not generate summary.";
  }
};

export const generateQuiz = async (topicOrContent: string, file?: { data: string, mimeType: string }): Promise<QuizQuestion[]> => {
  try {
    const ai = getAI();
    
    const prompt = `Generate 5 multiple-choice questions about: "${topicOrContent}". 
    Return as a JSON array of objects with keys: question, options (array of 4 strings), correctAnswer (index 0-3), and explanation.`;

    const parts: any[] = [{ text: prompt }];
    if (file) {
      parts.push({
        inlineData: {
          data: file.data.split(',')[1] || file.data,
          mimeType: file.mimeType
        }
      });
    }

    const genModel = ai.getGenerativeModel({
      model: MODEL_TO_USE,
      generationConfig: {
        responseMimeType: "application/json"
      }
    });

    const result = await genModel.generateContent({
      contents: [{ role: "user", parts }],
    });

    const text = result.response.text();
    if (!text) throw new Error("No response from AI");
    return JSON.parse(text);
  } catch (err) {
    console.error("Quiz Error:", err);
    throw err;
  }
};

export const getSmartRecommendations = async (chatHistory: string[]) => {
  try {
    const ai = getAI();
    const prompt = `Based on these study topics: ${chatHistory.join(", ")}. Suggest 3 follow-up study topics as a JSON array of strings.`;
    
    const genModel = ai.getGenerativeModel({
      model: MODEL_TO_USE,
      generationConfig: {
        responseMimeType: "application/json"
      }
    });
    
    const result = await genModel.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });

    const text = result.response.text();
    if (!text) return [];
    return JSON.parse(text);
  } catch {
    return [];
  }
};
