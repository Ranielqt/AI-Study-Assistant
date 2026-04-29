import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { QuizQuestion } from "../types";

let aiInstance: GoogleGenerativeAI | null = null;

export function getAI() {
  if (!aiInstance) {
    const apiKey = 
      (import.meta as any).env?.VITE_GEMINI_API_KEY || 
      (typeof process !== 'undefined' ? process.env?.GEMINI_API_KEY : '');
    
    if (!apiKey || apiKey.length < 10) {
      console.error("CRITICAL: GEMINI_API_KEY is missing.");
    }
    aiInstance = new GoogleGenerativeAI(apiKey || '');
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

export const generateStudyResponse = async (
  question: string, 
  history: { role: "user" | "model", parts: { text: string }[] }[],
  file?: { data: string, mimeType: string }
) => {
  const model = "gemini-1.5-flash";
  const genAI = getAI();
  
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

  try {
    const modelInstance = genAI.getGenerativeModel({
      model: model,
      systemInstruction: "You are a helpful AI Study Assistant. Help the student understand their material. Keep responses focused and readable.",
    });

    const result = await modelInstance.generateContent({
      contents,
    });

    const response = await result.response;
    return response.text() || "I'm sorry, I couldn't generate a response at this time.";
  } catch (err: any) {
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
  const genAI = getAI();
  const model = "gemini-1.5-flash";
  
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

  try {
    const modelInstance = genAI.getGenerativeModel({
      model: model,
      systemInstruction: `You are a helpful AI Study Assistant. Today's date is ${new Date().toLocaleDateString()} and the current time is ${new Date().toLocaleTimeString()}. Answer the student's questions clearly and concisely. Use markdown formatting. If a file is attached, analyze its content.`,
    });

    const result = await modelInstance.generateContentStream({
      contents,
    });

    return result.stream;
  } catch (err: any) {
    if (err.message?.includes('429') || err.message?.includes('quota')) {
      throw new Error("AI Quota Exceeded. Please wait 60 seconds.");
    }
    throw err;
  }
};

export const summarizeNotes = async (fileName: string, fileData?: { data: string, mimeType: string }, textContent?: string) => {
  const genAI = getAI();
  const model = "gemini-1.5-flash";
  
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
  }

  if (textContent) {
    parts.push({ text: `Content:\n${textContent}` });
  }

  try {
    const modelInstance = genAI.getGenerativeModel({
      model: model,
      systemInstruction: "You are an expert at academic summarization. Provide a clear, bulleted summary of the provided text/file.",
    });

    const result = await modelInstance.generateContent({
      contents: [{ role: "user", parts }],
    });

    const response = await result.response;
    return response.text() || "Unable to generate summary for this file.";
  } catch (err: any) {
    if (err.message?.includes('429') || err.message?.includes('quota')) {
      throw new Error("AI Quota Exceeded (Free Tier). Please wait a minute and try again.");
    }
    throw err;
  }
};

export const generateQuiz = async (topicOrContent: string, file?: { data: string, mimeType: string }): Promise<QuizQuestion[]> => {
  const genAI = getAI();
  const model = "gemini-1.5-flash";
  
  const parts: any[] = [{ 
    text: `Generate 5 multiple-choice questions based on the following topic or content: "${topicOrContent}". 
    Return the response as a JSON array where each object has: question, options (array of 4 strings), correctAnswer (index 0-3), and explanation.` 
  }];

  if (file) {
    parts.push({
      inlineData: {
        data: file.data.split(',')[1] || file.data,
        mimeType: file.mimeType
      }
    });
  }

  try {
    const modelInstance = genAI.getGenerativeModel({
      model: model,
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: SchemaType.ARRAY,
          items: {
            type: SchemaType.OBJECT,
            properties: {
              question: { type: SchemaType.STRING },
              options: { 
                type: SchemaType.ARRAY, 
                items: { type: SchemaType.STRING },
              },
              correctAnswer: { type: SchemaType.NUMBER, description: "Index of the correct option (0-3)" },
              explanation: { type: SchemaType.STRING }
            },
            required: ["question", "options", "correctAnswer", "explanation"]
          }
        }
      }
    });

    const result = await modelInstance.generateContent({
      contents: [{ 
        role: "user", 
        parts
      }],
    });

    const response = await result.response;
    const text = response.text();
    if (!text) throw new Error("Failed to generate quiz");
    return JSON.parse(text);
  } catch (err: any) {
    if (err.message?.includes('429') || err.message?.includes('quota')) {
      throw new Error("AI Quota Exceeded (Free Tier). Please wait a minute and try again.");
    }
    throw err;
  }
};

export const getSmartRecommendations = async (chatHistory: string[]) => {
  if (chatHistory.length < 3) return [];

  const genAI = getAI();
  const model = "gemini-1.5-flash";
  
  const modelInstance = genAI.getGenerativeModel({
    model: model,
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: SchemaType.ARRAY,
        items: { type: SchemaType.STRING }
      }
    }
  });
  
  try {
    const result = await modelInstance.generateContent({
      contents: [{
        role: "user",
        parts: [{ text: `Based on these recent student queries: ${chatHistory.join(", ")}. 
          Provide 3 short follow-up topics or questions they might be interested in. 
          Return as a JSON array of strings.` }]
      }],
    });

    const response = await result.response;
    const text = response.text();
    if (!text) return [];
    return JSON.parse(text);
  } catch (err) {
    return [];
  }
};