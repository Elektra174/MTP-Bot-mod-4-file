import { Message } from "@shared/schema";

export type BotMode = 'therapist' | 'educator' | 'practice_client' | 'supervisor' | null;

export interface SavedSession {
  id: string;
  scenarioId: string | null;
  scenarioName: string | null;
  messages: Message[];
  phase: string;
  createdAt: string;
  updatedAt: string;
  preview: string;
  mode?: BotMode;
}

const STORAGE_KEY = "mpt-sessions";
const MAX_SESSIONS = 20;

export const MODE_NAMES: Record<string, string> = {
  'educator': 'Обучение МПТ',
  'practice_client': 'Практика терапии',
  'supervisor': 'Супервизия',
};

export function getSavedSessions(): SavedSession[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return [];
    const sessions = JSON.parse(data) as SavedSession[];
    return sessions.sort((a, b) => 
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  } catch {
    return [];
  }
}

export function saveSession(session: {
  id: string;
  scenarioId: string | null;
  scenarioName: string | null;
  messages: Message[];
  phase: string;
  mode?: BotMode;
}): void {
  if (!session.id || session.messages.length === 0) return;
  
  try {
    const sessions = getSavedSessions();
    const existingIndex = sessions.findIndex(s => s.id === session.id);
    
    const firstUserMessage = session.messages.find(m => m.role === "user");
    const preview = firstUserMessage?.content.slice(0, 50) || "Новая сессия";
    
    const savedSession: SavedSession = {
      id: session.id,
      scenarioId: session.scenarioId,
      scenarioName: session.scenarioName,
      messages: session.messages,
      phase: session.phase,
      createdAt: existingIndex >= 0 ? sessions[existingIndex].createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      preview: preview + (firstUserMessage && firstUserMessage.content.length > 50 ? "..." : ""),
      mode: session.mode || (existingIndex >= 0 ? sessions[existingIndex].mode : null),
    };
    
    if (existingIndex >= 0) {
      sessions[existingIndex] = savedSession;
    } else {
      sessions.unshift(savedSession);
    }
    
    const trimmedSessions = sessions.slice(0, MAX_SESSIONS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmedSessions));
  } catch (e) {
    console.error("Failed to save session:", e);
  }
}

export function getSession(id: string): SavedSession | null {
  const sessions = getSavedSessions();
  return sessions.find(s => s.id === id) || null;
}

export function deleteSession(id: string): void {
  try {
    const sessions = getSavedSessions();
    const filtered = sessions.filter(s => s.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  } catch (e) {
    console.error("Failed to delete session:", e);
  }
}

export function clearAllSessions(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.error("Failed to clear sessions:", e);
  }
}

export function getSessionByMode(mode: BotMode): SavedSession | null {
  const sessions = getSavedSessions();
  return sessions.find(s => s.mode === mode) || null;
}

export function clearSessionsByMode(mode: BotMode): void {
  try {
    const sessions = getSavedSessions();
    const filtered = sessions.filter(s => s.mode !== mode);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  } catch (e) {
    console.error("Failed to clear mode sessions:", e);
  }
}
