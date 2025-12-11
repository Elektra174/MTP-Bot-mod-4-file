import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RotateCcw, MessageSquare } from "lucide-react";

interface SessionHeaderProps {
  scenarioName: string | null;
  phase: string;
  onNewSession: () => void;
}

const phaseLabels: Record<string, string> = {
  "initial": "Начало сессии",
  "goals": "Исследование целей",
  "needs": "Поиск потребности",
  "energy": "Энергия потребности",
  "metaposition": "Метапозиция",
  "integration": "Интеграция",
  "actions": "Новые действия",
  "closing": "Завершение"
};

export function SessionHeader({ scenarioName, phase, onNewSession }: SessionHeaderProps) {
  return (
    <div className="flex items-center justify-between gap-1.5 sm:gap-4 p-2 sm:p-4 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex items-center gap-1 sm:gap-3 min-w-0 flex-1">
        <div className="flex items-center gap-1 sm:gap-2 min-w-0 flex-shrink-0">
          <MessageSquare className="w-4 h-4 sm:w-5 sm:h-5 text-primary flex-shrink-0" />
          <span className="font-semibold text-xs sm:text-lg whitespace-nowrap">
            {scenarioName || "МПТ Терапевт"}
          </span>
        </div>
        <Badge variant="secondary" className="flex-shrink-0 text-[10px] sm:text-sm px-1.5 sm:px-2.5 py-0.5" data-testid="badge-session-phase">
          {phaseLabels[phase] || phase}
        </Badge>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={onNewSession}
        className="flex-shrink-0 px-1.5 sm:px-3 text-xs sm:text-sm whitespace-nowrap"
        data-testid="button-new-session"
      >
        <RotateCcw className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
        <span>Новая сессия</span>
      </Button>
    </div>
  );
}
