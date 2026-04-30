import { GoogleGenerativeAI } from "@google/generative-ai";
import { QuizQuestion } from "../types";

let aiInstance: GoogleGenerativeAI | null = null;

export function getAI() {
  if (!aiInstance) {
    const apiKey = (import.meta as any).env?.VITE_GEMINI_API_KEY || 
                   (import.meta as any).env?.GEMINI_API_KEY ||
                   (process as any).env?.GEMINI_API_KEY;
                   
    aiInstance = new GoogleGenerativeAI(apiKey || "");
  }
  return aiInstance;
}

const MODEL_TO_USE = "gemini-1.5-flash";

export const generateStudyResponse = async (question: string, history: any[], file?: { data: string, mimeType: string }) => {
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
      role: h.role,
      parts: h.parts.map((p: any) => ({ text: p.text }))
    }));
    contents.push({ role: "user", parts });
    const genModel = ai.getGenerativeModel({ model: MODEL_TO_USE });
    const result = await genModel.generateContent({ contents });
    return result.response.text();
  } catch (err: any) {
    console.error("AI SDK Error:", err);
    throw err;
  }
};

export const generateChatStream = async (question: string, history: any[], file?: { data: string, mimeType: string }) => {
  try {
    const ai = getAI();
    const parts: any[] = [{ text: question || (file ? "Analyze this file." : "") }];
    if (file) {
      parts.push({ inlineData: { data: file.data.split(',')[1] || file.data, mimeType: file.mimeType } });
    }
    const contents = history.map(h => ({
      role: h.role,
      parts: h.parts.map((p: any) => ({ text: p.text }))
    }));
    contents.push({ role: "user", parts });
    const genModel = ai.getGenerativeModel({ model: MODEL_TO_USE });
    return await genModel.generateContentStream({ contents });
  } catch (err: any) { throw err; }
};

export const summarizeNotes = async (fileName: string, fileData?: { data: string, mimeType: string }, textContent?: string) => {
  try {
    const ai = getAI();
    const parts: any[] = [{ text: `Summarize the following notes from "${fileName}".` }];
    if (fileData) {
      parts.push({ inlineData: { data: fileData.data.split(',')[1] || fileData.data, mimeType: fileData.mimeType } });
    } else if (textContent) {
      parts.push({ text: `Content:\n${textContent}` });
    }
    const genModel = ai.getGenerativeModel({ model: MODEL_TO_USE });
    const result = await genModel.generateContent({ contents: [{ role: "user", parts }] });
    return result.response.text();
  } catch (err) { return "Could not generate summary."; }
};

export const generateQuiz = async (topicOrContent: string, file?: { data: string, mimeType: string }): Promise<QuizQuestion[]> => {
  try {
    const ai = getAI();
    const prompt = `Generate 5 multiple-choice questions about: "${topicOrContent}". Return as a JSON array.`;
    const parts: any[] = [{ text: prompt }];
    if (file) {
      parts.push({ inlineData: { data: file.data.split(',')[1] || file.data, mimeType: file.mimeType } });
    }
    const genModel = ai.getGenerativeModel({
      model: MODEL_TO_USE,
      generationConfig: { responseMimeType: "application/json" }
    });
    const result = await genModel.generateContent({ contents: [{ role: "user", parts }] });
    return JSON.parse(result.response.text());
  } catch (err) { throw err; }
};