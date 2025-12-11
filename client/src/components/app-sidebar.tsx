import { useState, useEffect } from "react";
import { scenarios, Scenario } from "@shared/schema";
import { ScenarioCard } from "@/components/scenario-card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Brain, MessageSquarePlus, History, Trash2, GraduationCap, Users, ClipboardCheck, ChevronDown, RotateCcw } from "lucide-react";
import { getSavedSessions, deleteSession, clearAllSessions, clearSessionsByMode, getSessionByMode, SavedSession, BotMode, MODE_NAMES } from "@/lib/session-storage";

interface AppSidebarProps {
  selectedScenarioId: string | null;
  onSelectScenario: (scenario: Scenario | null) => void;
  onNewSession: () => void;
  onLoadSession?: (session: SavedSession) => void;
  onModeSelect?: (mode: string, triggerMessage: string) => void;
  refreshTrigger?: number;
}

export function AppSidebar({ selectedScenarioId, onSelectScenario, onNewSession, onLoadSession, onModeSelect, refreshTrigger }: AppSidebarProps) {
  const [savedSessions, setSavedSessions] = useState<SavedSession[]>([]);
  const [isModesOpen, setIsModesOpen] = useState(false);

  useEffect(() => {
    setSavedSessions(getSavedSessions());
  }, [refreshTrigger]);

  const handleDeleteSession = (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    deleteSession(sessionId);
    setSavedSessions(getSavedSessions());
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return "Сегодня";
    if (diffDays === 1) return "Вчера";
    if (diffDays < 7) return `${diffDays} дн. назад`;
    return date.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
  };

  return (
    <Sidebar>
      <SidebarHeader className="p-4 border-b">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-md bg-primary flex items-center justify-center">
            <Brain className="w-6 h-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="font-semibold text-lg">МПТ Терапевт</h1>
            <p className="text-xs text-muted-foreground">Мета-персональная терапия</p>
          </div>
        </div>
      </SidebarHeader>
      
      <SidebarContent>
        <SidebarGroup>
          <div className="px-4 pt-4 flex flex-col gap-2">
            <Button 
              className="w-full justify-start" 
              variant={selectedScenarioId === null ? "default" : "outline"}
              onClick={() => {
                onSelectScenario(null);
                onNewSession();
              }}
              data-testid="button-free-request"
            >
              <MessageSquarePlus className="w-4 h-4 mr-2" />
              Свободный запрос
            </Button>
          </div>
        </SidebarGroup>

        <SidebarGroup>
          <Collapsible open={isModesOpen} onOpenChange={setIsModesOpen}>
            <CollapsibleTrigger className="w-full">
              <SidebarGroupLabel className="px-4 flex items-center justify-between cursor-pointer hover:bg-accent/50 rounded-md">
                <span>Режимы работы</span>
                <ChevronDown className={`w-4 h-4 transition-transform ${isModesOpen ? 'rotate-180' : ''}`} />
              </SidebarGroupLabel>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <SidebarGroupContent>
                <div className="flex flex-col gap-1 px-4">
                  <div
                    className="group flex items-center gap-2 p-2 rounded-md hover:bg-accent cursor-pointer text-sm"
                    onClick={() => {
                      onSelectScenario(null);
                      onModeSelect?.('educator', 'Расскажи про МПТ — какие основные принципы и структура сессии?');
                    }}
                  >
                    <GraduationCap className="w-4 h-4 text-blue-500" />
                    <div className="flex-1">
                      <p className="font-medium">Обучение МПТ</p>
                      <p className="text-xs text-muted-foreground">
                        {getSessionByMode('educator') ? 'Продолжить диалог' : 'Вопросы о методе'}
                      </p>
                    </div>
                    {getSessionByMode('educator') && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => {
                          e.stopPropagation();
                          clearSessionsByMode('educator');
                          setSavedSessions(getSavedSessions());
                        }}
                        title="Начать заново"
                      >
                        <RotateCcw className="w-3 h-3 text-muted-foreground hover:text-destructive" />
                      </Button>
                    )}
                  </div>
                  <div
                    className="group flex items-center gap-2 p-2 rounded-md hover:bg-accent cursor-pointer text-sm"
                    onClick={() => {
                      onSelectScenario(null);
                      onModeSelect?.('practice_client', 'Хочу попрактиковаться в роли терапевта, а ты будешь клиентом.');
                    }}
                  >
                    <Users className="w-4 h-4 text-green-500" />
                    <div className="flex-1">
                      <p className="font-medium">Практика терапии</p>
                      <p className="text-xs text-muted-foreground">
                        {getSessionByMode('practice_client') ? 'Продолжить практику' : 'Бот как клиент'}
                      </p>
                    </div>
                    {getSessionByMode('practice_client') && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => {
                          e.stopPropagation();
                          clearSessionsByMode('practice_client');
                          setSavedSessions(getSavedSessions());
                        }}
                        title="Начать заново"
                      >
                        <RotateCcw className="w-3 h-3 text-muted-foreground hover:text-destructive" />
                      </Button>
                    )}
                  </div>
                  <div
                    className="group flex items-center gap-2 p-2 rounded-md hover:bg-accent cursor-pointer text-sm"
                    onClick={() => {
                      onSelectScenario(null);
                      onModeSelect?.('supervisor', 'Режим супервизии. Хочу разобрать сессию и получить рекомендации.');
                    }}
                  >
                    <ClipboardCheck className="w-4 h-4 text-orange-500" />
                    <div className="flex-1">
                      <p className="font-medium">Супервизия</p>
                      <p className="text-xs text-muted-foreground">
                        {getSessionByMode('supervisor') ? 'Продолжить разбор' : 'Разбор сессий'}
                      </p>
                    </div>
                    {getSessionByMode('supervisor') && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => {
                          e.stopPropagation();
                          clearSessionsByMode('supervisor');
                          setSavedSessions(getSavedSessions());
                        }}
                        title="Начать заново"
                      >
                        <RotateCcw className="w-3 h-3 text-muted-foreground hover:text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>
              </SidebarGroupContent>
            </CollapsibleContent>
          </Collapsible>
        </SidebarGroup>

        {savedSessions.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel className="px-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4" />
                История сессий
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs text-muted-foreground hover:text-destructive"
                onClick={() => {
                  clearAllSessions();
                  setSavedSessions([]);
                }}
              >
                Очистить
              </Button>
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <div className="flex flex-col gap-1 px-4">
                {savedSessions.slice(0, 5).map((session) => (
                  <div
                    key={session.id}
                    className="group flex items-center justify-between p-2 rounded-md hover:bg-accent cursor-pointer text-sm"
                    onClick={() => onLoadSession?.(session)}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="truncate font-medium">
                        {session.mode && MODE_NAMES[session.mode] ? MODE_NAMES[session.mode] : (session.scenarioName || "Свободный запрос")}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {session.preview}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(session.updatedAt)}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => handleDeleteSession(e, session.id)}
                    >
                      <Trash2 className="w-3 h-3 text-muted-foreground hover:text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        <SidebarGroup>
          <SidebarGroupLabel className="px-4">Сценарии терапии</SidebarGroupLabel>
          <SidebarGroupContent>
            <ScrollArea className="h-[calc(100vh-220px)]">
              <div className="flex flex-col gap-2 px-4 pb-4">
                {scenarios.map((scenario) => (
                  <ScenarioCard
                    key={scenario.id}
                    scenario={scenario}
                    isSelected={selectedScenarioId === scenario.id}
                    onClick={() => {
                      onSelectScenario(scenario);
                      onNewSession();
                    }}
                  />
                ))}
              </div>
            </ScrollArea>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
