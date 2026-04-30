import { GoogleGenerativeAI } from "@google/generative-ai";
import { QuizQuestion } from "../types";

let aiInstance: GoogleGenerativeAI | null = null;

export function getAI() {
  if (!aiInstance) {
    // In Vite/Vercel, environmental variables MUST be prefixed with VITE_ to be exposed to the client.
    // However, some platforms polyfill process.env.
    const apiKey = (import.meta as any).env?.VITE_GEMINI_API_KEY || 
                   (import.meta as any).env?.GEMINI_API_KEY ||
                   (process as any).env?.VITE_GEMINI_API_KEY ||
                   (process as any).env?.GEMINI_API_KEY;
                   
    if (!apiKey) {
      console.error("Missing Gemini API Key. Please set VITE_GEMINI_API_KEY.");
    }
    // Force the stable v1 API version to avoid 404 errors on v1beta
    aiInstance = new GoogleGenerativeAI(apiKey || "");
  }
  return aiInstance;
}

// Using the most stable model identifier
const MODEL_TO_USE = "gemini-1.5-flash-latest";

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
    const genModel = ai.getGenerativeModel({ model: MODEL_TO_USE }, { apiVersion: "v1" });
    
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
      role: h.role === 'assistant' ? 'model' : h.role, // SDK uses 'model' instead of 'assistant'
      parts: h.parts.map((p: any) => ({ text: p.text }))
    }));
    
    contents.push({ role: "user", parts });

    // Prepend system instruction as a user message if systemInstruction causes 404 in v1beta
    // or just use it the standard way. Let's try standard first but with the latest SDK pattern.
    const chat = genModel.startChat({
      history: contents.slice(0, -1),
      generationConfig: {
        maxOutputTokens: 1000,
      },
    });

    const result = await chat.sendMessage(contents[contents.length - 1].parts);
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
    const genModel = ai.getGenerativeModel({ model: MODEL_TO_USE }, { apiVersion: "v1" });

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
      role: h.role === 'assistant' ? 'model' : h.role,
      parts: h.parts.map((p: any) => ({ text: p.text }))
    }));

    const chat = genModel.startChat({
      history: contents,
    });

    return await chat.sendMessageStream(parts);
  } catch (err: any) {
    console.error("AI Stream SDK Error:", err);
    throw err;
  }
};

export const summarizeNotes = async (fileName: string, fileData?: { data: string, mimeType: string }, textContent?: string) => {
  try {
    const ai = getAI();
    const genModel = ai.getGenerativeModel({ model: MODEL_TO_USE }, { apiVersion: "v1" });
    
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
    // Use v1 to avoid 404s
    const genModel = ai.getGenerativeModel({ 
      model: MODEL_TO_USE,
      generationConfig: {
        responseMimeType: "application/json"
      }
    }, { apiVersion: "v1" });
    
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

    const result = await genModel.generateContent({
      contents: [{ role: "user", parts }],
    });

    const text = result.response.text();
    if (!text) throw new Error("No response from AI");
    
    // Clean JSON if needed (sometimes wrapped in markdown code blocks)
    let cleanedText = text.trim();
    if (cleanedText.startsWith("```json")) {
      cleanedText = cleanedText.replace(/^```json/, "").replace(/```$/, "").trim();
    } else if (cleanedText.startsWith("```")) {
      cleanedText = cleanedText.replace(/^```/, "").replace(/```$/, "").trim();
    }
    
    return JSON.parse(cleanedText);
  } catch (err) {
    console.error("Quiz Error:", err);
    throw err;
  }
};

export const getSmartRecommendations = async (chatHistory: string[]) => {
  try {
    const ai = getAI();
    const genModel = ai.getGenerativeModel({ 
      model: MODEL_TO_USE,
      generationConfig: {
        responseMimeType: "application/json"
      }
    }, { apiVersion: "v1" });

    const prompt = `Based on these study topics: ${chatHistory.join(", ")}. Suggest 3 follow-up study topics as a JSON array of strings.`;
    
    const result = await genModel.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });

    const text = result.response.text();
    if (!text) return [];
    
    let cleanedText = text.trim();
    if (cleanedText.startsWith("```json")) {
      cleanedText = cleanedText.replace(/^```json/, "").replace(/```$/, "").trim();
    }
    
    return JSON.parse(cleanedText);
  } catch {
    return [];
  }
};
