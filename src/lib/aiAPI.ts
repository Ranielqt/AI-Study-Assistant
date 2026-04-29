import { GoogleGenAI, Type } from "@google/genai";
import { QuizQuestion } from "../types";

let aiInstance: GoogleGenAI | null = null;

export function getAI() {
  if (!aiInstance) {
    const apiKey = process.env.GEMINI_API_KEY;
    
    if (!apiKey) {
      console.warn("GEMINI_API_KEY is missing in process.env. AI features may fail.");
    }
    aiInstance = new GoogleGenAI({ apiKey: apiKey || '' });
  }
  return aiInstance;
}

/**
 * Cap history to avoid hitting Token limits (TPM) and saving cost/quota.
 * Keeps the last 10 turns (20 messages).
 */
const capHistory = (history: any[]) => {
  if (history.length > 20) {
    return history.slice(-20);
  }
  return history;
};

const DEFAULT_MODEL = "gemini-3-flash-preview";

export const generateStudyResponse = async (
  question: string, 
  history: { role: "user" | "model", parts: { text: string }[] }[],
  file?: { data: string, mimeType: string }
) => {
  try {
    const ai = getAI();
    const contents = capHistory([...history]);
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
      model: DEFAULT_MODEL,
      contents,
      config: {
        systemInstruction: "You are a helpful AI Study Assistant. Help the student understand their material. Keep responses focused and readable.",
      }
    });

    return response.text || "I'm sorry, I couldn't generate a response at this time.";
  } catch (err: any) {
    console.error("AI Error:", err);
    if (err.message?.includes('429') || err.message?.includes('quota')) {
      throw new Error("AI Quota Exceeded. Please wait 60 seconds.");
    }
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
    const contents = capHistory([...history]);
    const currentParts: any[] = [{ text: question || (file ? "Analyze this file." : "") }];
    
    if (file) {
      currentParts.push({
        inlineData: {
          data: file.data.split(',')[1] || file.data,
          mimeType: file.mimeType
        }
      });
    }

    contents.push({ role: "user", parts: currentParts });

    return await ai.models.generateContentStream({
      model: DEFAULT_MODEL,
      contents,
      config: {
        systemInstruction: `You are a helpful AI Study Assistant. Today's date is ${new Date().toLocaleDateString()} and the current time is ${new Date().toLocaleTimeString()}. Answer the student's questions clearly and concisely. Use markdown formatting. If a file is attached, analyze its content.`,
      }
    });
  } catch (err: any) {
    console.error("AI Stream Error:", err);
    if (err.message?.includes('429') || err.message?.includes('quota')) {
      throw new Error("AI Quota Exceeded. Please wait 60 seconds.");
    }
    throw err;
  }
};

export const summarizeNotes = async (fileName: string, fileData?: { data: string, mimeType: string }, textContent?: string) => {
  try {
    const ai = getAI();
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
      model: DEFAULT_MODEL,
      contents: [{ role: "user", parts }],
      config: {
        systemInstruction: "You are an expert at academic summarization. Provide a clear, bulleted summary of the provided text/file.",
      }
    });

    return response.text || "Unable to generate summary for this file.";
  } catch (err: any) {
    console.error("AI Summarize Error:", err);
    if (err.message?.includes('429') || err.message?.includes('quota')) {
      throw new Error("AI Quota Exceeded (Free Tier). Please wait a minute and try again.");
    }
    throw err;
  }
};

export const generateQuiz = async (topicOrContent: string, file?: { data: string, mimeType: string }): Promise<QuizQuestion[]> => {
  try {
    const ai = getAI();
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
      model: DEFAULT_MODEL,
      contents: [{ role: "user", parts }],
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
  } catch (err: any) {
    console.error("AI Quiz Error:", err);
    if (err.message?.includes('429') || err.message?.includes('quota')) {
      throw new Error("AI Quota Exceeded (Free Tier). Please wait a minute and try again.");
    }
    throw err;
  }
};

export const getSmartRecommendations = async (chatHistory: string[]) => {
  if (chatHistory.length < 3) return [];

  try {
    const ai = getAI();
    const response = await ai.models.generateContent({
      model: DEFAULT_MODEL,
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
  } catch (err) {
    console.error("Recommendations error:", err);
    return [];
  }
};
