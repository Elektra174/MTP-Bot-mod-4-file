import { Scenario } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { HelpCircle } from "lucide-react";

interface ScenarioCardProps {
  scenario: Scenario;
  isSelected?: boolean;
  onClick: () => void;
}

export function ScenarioCard({ scenario, isSelected, onClick }: ScenarioCardProps) {
  return (
    <Card
      className={cn(
        "cursor-pointer transition-all duration-200 hover-elevate",
        isSelected && "ring-2 ring-primary bg-primary/5"
      )}
      onClick={onClick}
      data-testid={`scenario-card-${scenario.id}`}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className={cn(
            "flex-shrink-0 w-10 h-10 rounded-md flex items-center justify-center",
            isSelected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
          )}>
            <HelpCircle className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-medium text-sm">{scenario.name}</h3>
            <p className="text-xs text-muted-foreground mt-1">
              {scenario.description}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
