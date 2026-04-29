import { GoogleGenAI } from "@google/genai";
import { QuizQuestion } from "../types";

let aiInstance: GoogleGenAI | null = null;

export function getAI() {
  if (!aiInstance) {
    // Check various ways the key might be exposed (AI Studio context)
    const apiKey = (process as any).env?.GEMINI_API_KEY || 
                   (import.meta as any).env?.GEMINI_API_KEY || 
                   (import.meta as any).env?.VITE_GEMINI_API_KEY;
                   
    if (!apiKey) {
      console.warn("GEMINI_API_KEY is missing from environment secrets.");
    }
    aiInstance = new GoogleGenAI({ apiKey: apiKey || "" });
  }
  return aiInstance;
}

const MODEL_TO_USE = "gemini-2.0-flash";

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

    const response = await ai.models.generateContent({
      model: MODEL_TO_USE,
      contents,
      config: {
        systemInstruction: "You are a helpful AI Study Assistant. Keep responses focused and readable.",
      }
    });

    return response.text; // Use .text property, not .text()
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

    // Use generateContentStream
    return await ai.models.generateContentStream({
      model: MODEL_TO_USE,
      contents,
      config: {
        systemInstruction: "You are a helpful AI Study Assistant. Help the student understand their material. Use markdown.",
      }
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

    const response = await ai.models.generateContent({
      model: MODEL_TO_USE,
      contents: [{ role: "user", parts }]
    });

    return response.text;
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

    const response = await ai.models.generateContent({
      model: MODEL_TO_USE,
      contents: [{ role: "user", parts }],
      config: {
        responseMimeType: "application/json"
      }
    });

    const text = response.text;
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
    
    const response = await ai.models.generateContent({
      model: MODEL_TO_USE,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json"
      }
    });

    const text = response.text;
    if (!text) return [];
    return JSON.parse(text);
  } catch {
    return [];
  }
};
