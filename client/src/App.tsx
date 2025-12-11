import { useState, useCallback } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ChatPage } from "@/pages/chat";
import { Scenario } from "@shared/schema";
import { SavedSession, BotMode, getSessionByMode } from "@/lib/session-storage";

function App() {
  const [selectedScenario, setSelectedScenario] = useState<Scenario | null>(null);
  const [sessionKey, setSessionKey] = useState(0);
  const [loadedSession, setLoadedSession] = useState<SavedSession | null>(null);
  const [sidebarRefreshTrigger, setSidebarRefreshTrigger] = useState(0);
  const [pendingTriggerMessage, setPendingTriggerMessage] = useState<string | null>(null);
  const [currentMode, setCurrentMode] = useState<BotMode>(null);

  const handleSelectScenario = (scenario: Scenario | null) => {
    setSelectedScenario(scenario);
    setLoadedSession(null);
    setCurrentMode(null);
  };

  const handleNewSession = () => {
    setSessionKey((prev) => prev + 1);
    setLoadedSession(null);
  };

  const handleLoadSession = (session: SavedSession) => {
    setLoadedSession(session);
    setSelectedScenario(null);
    setCurrentMode(session.mode || null);
    setSessionKey((prev) => prev + 1);
  };

  const handleModeSelect = (mode: string, triggerMessage: string) => {
    const typedMode = mode as BotMode;
    setCurrentMode(typedMode);
    
    const existingSession = getSessionByMode(typedMode);
    if (existingSession) {
      setLoadedSession(existingSession);
      setSelectedScenario(null);
      setSessionKey((prev) => prev + 1);
    } else {
      setLoadedSession(null);
      setSelectedScenario(null);
      setSessionKey((prev) => prev + 1);
      setPendingTriggerMessage(triggerMessage);
    }
  };

  const handleTriggerMessageSent = useCallback(() => {
    setPendingTriggerMessage(null);
  }, []);

  const handleSessionSaved = useCallback(() => {
    setSidebarRefreshTrigger((prev) => prev + 1);
  }, []);

  const sidebarStyle = {
    "--sidebar-width": "20rem",
    "--sidebar-width-icon": "4rem",
  };

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="light" storageKey="mpt-theme">
        <TooltipProvider>
          <SidebarProvider style={sidebarStyle as React.CSSProperties}>
            <div className="flex h-screen w-full">
              <AppSidebar
                selectedScenarioId={selectedScenario?.id || null}
                onSelectScenario={handleSelectScenario}
                onNewSession={handleNewSession}
                onLoadSession={handleLoadSession}
                onModeSelect={handleModeSelect}
                refreshTrigger={sidebarRefreshTrigger}
              />
              <div className="flex flex-col flex-1 min-w-0">
                <header className="flex items-center justify-between gap-4 p-2 border-b bg-background">
                  <SidebarTrigger data-testid="button-sidebar-toggle" />
                  <ThemeToggle />
                </header>
                <main className="flex-1 overflow-hidden">
                  <ChatPage
                    key={sessionKey}
                    selectedScenario={selectedScenario}
                    onNewSession={handleNewSession}
                    loadedSession={loadedSession}
                    onSessionSaved={handleSessionSaved}
                    pendingTriggerMessage={pendingTriggerMessage}
                    onTriggerMessageSent={handleTriggerMessageSent}
                    currentMode={currentMode}
                  />
                </main>
              </div>
            </div>
          </SidebarProvider>
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
