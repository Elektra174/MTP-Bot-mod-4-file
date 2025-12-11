import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Message, Scenario } from "@shared/schema";
import { ChatMessage } from "@/components/chat-message";
import { ChatInput } from "@/components/chat-input";
import { TypingIndicator } from "@/components/typing-indicator";
import { SessionHeader } from "@/components/session-header";
import { EmptyChat } from "@/components/empty-chat";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { saveSession, SavedSession, BotMode } from "@/lib/session-storage";

interface AttachedFile {
  filename: string;
  mimeType: string;
  extractedText: string;
  isImage: boolean;
  imageBase64?: string | null;
}

interface ChatPageProps {
  selectedScenario: Scenario | null;
  onNewSession: () => void;
  loadedSession?: SavedSession | null;
  onSessionSaved?: () => void;
  pendingTriggerMessage?: string | null;
  onTriggerMessageSent?: () => void;
  currentMode?: BotMode;
}

export function ChatPage({ selectedScenario, onNewSession, loadedSession, onSessionSaved, pendingTriggerMessage, onTriggerMessageSent, currentMode }: ChatPageProps) {
  const [messages, setMessages] = useState<Message[]>(loadedSession?.messages || []);
  const [sessionId, setSessionId] = useState<string | null>(loadedSession?.id || null);
  const [phase, setPhase] = useState(loadedSession?.phase || "initial");
  const [scenarioName, setScenarioName] = useState<string | null>(loadedSession?.scenarioName || null);
  const [scenarioId, setScenarioId] = useState<string | null>(loadedSession?.scenarioId || null);
  const [isLoading, setIsLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const initialMessageCountRef = useRef<number>(loadedSession?.messages?.length || 0);
  const { toast } = useToast();

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingContent, scrollToBottom]);

  const lastScenarioIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (selectedScenario) {
      setScenarioName(selectedScenario.name);
      setScenarioId(selectedScenario.id);
      
      // Auto-start therapy when a new scenario is selected
      if (selectedScenario.id !== lastScenarioIdRef.current && messages.length === 0) {
        lastScenarioIdRef.current = selectedScenario.id;
        // Send an automatic greeting message for this scenario
        const greetingMessage = `Здравствуй, я хотел бы поработать с темой "${selectedScenario.name}". ${selectedScenario.description}.`;
        handleSendMessage(greetingMessage);
      }
    }
  }, [selectedScenario]);

  // Handle pending trigger message from mode selection
  useEffect(() => {
    if (pendingTriggerMessage && messages.length === 0 && !isLoading) {
      handleSendMessage(pendingTriggerMessage);
      onTriggerMessageSent?.();
    }
  }, [pendingTriggerMessage, messages.length, isLoading]);

  useEffect(() => {
    if (sessionId && messages.length > 0 && messages.length > initialMessageCountRef.current) {
      saveSession({
        id: sessionId,
        scenarioId: scenarioId,
        scenarioName: scenarioName,
        messages: messages,
        phase: phase,
        mode: currentMode,
      });
      initialMessageCountRef.current = messages.length;
      onSessionSaved?.();
    }
  }, [sessionId, messages, scenarioId, scenarioName, phase, onSessionSaved, currentMode]);

  const handleSendMessage = async (content: string, attachedFiles?: AttachedFile[]) => {
    // Build display content (what user sees - just file names)
    let displayContent = content;
    // Build API content (what bot receives - full extracted text)
    let apiContent = content;
    
    if (attachedFiles && attachedFiles.length > 0) {
      // For display: just show file names
      const fileLabels = attachedFiles.map(file => {
        if (file.isImage) {
          return `📎 ${file.filename}`;
        }
        return `📄 ${file.filename}`;
      }).join('\n');
      
      // For API: include full extracted text for bot to read
      const fileContents = attachedFiles.map(file => {
        if (file.isImage) {
          return `[Прикреплено изображение: ${file.filename}]`;
        }
        return `--- Содержимое файла: ${file.filename} ---\n${file.extractedText}\n--- Конец файла ---`;
      }).join('\n\n');
      
      if (content) {
        displayContent = `${content}\n\n${fileLabels}`;
        apiContent = `${content}\n\n${fileContents}`;
      } else {
        displayContent = fileLabels;
        apiContent = fileContents;
      }
    }

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: displayContent,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);
    setStreamingContent("");

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: apiContent,
          sessionId: sessionId || undefined,
          scenarioId: scenarioId || selectedScenario?.id || undefined,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to send message");
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No reader available");

      const decoder = new TextDecoder();
      let fullContent = "";
      let currentSessionId = sessionId;
      let currentPhase = phase;
      let currentScenarioName = scenarioName;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        const lines = text.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              
              if (data.type === "meta") {
                currentSessionId = data.sessionId;
                setSessionId(data.sessionId);
                if (data.scenarioName) {
                  currentScenarioName = data.scenarioName;
                  setScenarioName(data.scenarioName);
                }
              } else if (data.type === "chunk") {
                fullContent += data.content;
                setStreamingContent(fullContent);
              } else if (data.type === "done") {
                currentPhase = data.phase;
                setPhase(data.phase);
              } else if (data.type === "error") {
                throw new Error(data.message);
              }
            } catch (e) {
              if (line.slice(6).trim()) {
                console.error("Failed to parse SSE data:", e);
              }
            }
          }
        }
      }

      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: fullContent,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
      setStreamingContent("");

    } catch (error) {
      toast({
        title: "Ошибка",
        description: error instanceof Error ? error.message : "Не удалось отправить сообщение",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleNewSession = () => {
    setMessages([]);
    setSessionId(null);
    setPhase("initial");
    setScenarioName(selectedScenario?.name || null);
    setScenarioId(selectedScenario?.id || null);
    lastScenarioIdRef.current = null;
    initialMessageCountRef.current = 0;
    onNewSession();
  };

  return (
    <div className="flex flex-col h-full">
      <SessionHeader
        scenarioName={scenarioName}
        phase={phase}
        onNewSession={handleNewSession}
      />
      
      <ScrollArea className="flex-1">
        <div className="max-w-4xl mx-auto p-4">
          {messages.length === 0 && !streamingContent ? (
            <EmptyChat />
          ) : (
            <div className="flex flex-col gap-4">
              {messages.map((message) => (
                <ChatMessage key={message.id} message={message} />
              ))}
              {streamingContent && (
                <ChatMessage
                  message={{
                    id: "streaming",
                    role: "assistant",
                    content: streamingContent,
                    timestamp: new Date().toISOString(),
                  }}
                />
              )}
              {isLoading && !streamingContent && <TypingIndicator />}
              <div ref={scrollRef} />
            </div>
          )}
        </div>
      </ScrollArea>
      
      <div className="max-w-4xl mx-auto w-full">
        <ChatInput
          onSend={handleSendMessage}
          isLoading={isLoading}
          placeholder={
            messages.length === 0
              ? "Расскажите, с чем вы хотите поработать сегодня..."
              : "Ваш ответ..."
          }
        />
      </div>
    </div>
  );
}
