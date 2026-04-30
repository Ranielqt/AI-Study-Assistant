import { GoogleGenAI, Type } from "@google/genai";
import { QuizQuestion } from "../types";

let aiInstance: GoogleGenAI | null = null;

export function getAI() {
  if (!aiInstance) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not set in environment variables");
    }
    aiInstance = new GoogleGenAI({ apiKey });
  }
  return aiInstance;
}

// ✅ FIXED: Use stable model instead of experimental one
// gemini-2.0-flash-exp is deprecated/404
const MODEL_TO_USE = "gemini-1.5-flash";  // Fast, stable, widely available

// Alternative if you need more capability:
// const MODEL_TO_USE = "gemini-1.5-pro";

export const generateStudyResponse = async (
  question: string, 
  history: any[],
  file?: { data: string, mimeType: string }
) => {
  console.log(`[AI] Generating response with model: ${MODEL_TO_USE}`);
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
    
    const contents = history.map(h => ({
      role: h.role === 'assistant' ? 'model' : h.role,
      parts: h.parts.map((p: any) => ({ text: p.text }))
    }));
    
    const response = await ai.models.generateContent({
      model: MODEL_TO_USE,
      contents: [...contents, { role: "user", parts }]
    });

    return response.text || "No response generated.";
  } catch (error) {
    console.error("[AI] Error in generateStudyResponse:", error);
    throw error;
  }
};

export const generateChatStream = async (
  question: string,
  history: any[],
  file?: { data: string, mimeType: string }
) => {
  console.log(`[AI] Generating stream with model: ${MODEL_TO_USE}`);
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

    const contents = history.slice(-20).map(h => ({
      role: h.role === 'assistant' ? 'model' : h.role,
      parts: h.parts.map((p: any) => ({ text: p.text }))
    }));

    return await ai.models.generateContentStream({
      model: MODEL_TO_USE,
      contents: [...contents, { role: "user", parts }]
    });
  } catch (error) {
    console.error("[AI] Error in generateChatStream:", error);
    throw error;
  }
};

export const summarizeNotes = async (fileName: string, fileData?: { data: string, mimeType: string }, textContent?: string) => {
  console.log(`[AI] Summarizing notes with model: ${MODEL_TO_USE}`);
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

    return response.text || "Could not generate summary.";
  } catch (error) {
    console.error("[AI] Error in summarizeNotes:", error);
    return "Failed to generate summary. Please try again.";
  }
};

export const generateQuiz = async (topicOrContent: string, file?: { data: string, mimeType: string }): Promise<QuizQuestion[]> => {
  console.log(`[AI] Generating quiz with model: ${MODEL_TO_USE}`);
  try {
    const ai = getAI();
    const prompt = `Generate 5 multiple-choice questions about: "${topicOrContent}". 
    Return strictly a JSON array of objects with keys: question, options (array of 4 strings), correctAnswer (index 0-3), and explanation.`;

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
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              question: { type: Type.STRING },
              options: { 
                type: Type.ARRAY,
                items: { type: Type.STRING }
              },
              correctAnswer: { type: Type.NUMBER },
              explanation: { type: Type.STRING }
            },
            required: ["question", "options", "correctAnswer", "explanation"]
          }
        }
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response from AI");
    return JSON.parse(text);
  } catch (error) {
    console.error("[AI] Error in generateQuiz:", error);
    throw new Error("Failed to generate quiz. Please try again.");
  }
};

export const getSmartRecommendations = async (chatHistory: string[]) => {
  console.log(`[AI] Getting recommendations with model: ${MODEL_TO_USE}`);
  try {
    const ai = getAI();
    const prompt = `Based on these study topics: ${chatHistory.join(", ")}. Suggest 3 follow-up study topics as a JSON array of strings.`;
    
    const response = await ai.models.generateContent({
      model: MODEL_TO_USE,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
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
  } catch (error) {
    console.error("[AI] Error in getSmartRecommendations:", error);
    return [];
  }
};