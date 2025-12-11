import { MessageSquare, Sparkles, Heart, Shield } from "lucide-react";

export function EmptyChat() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center" data-testid="empty-chat-state">
      <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-6">
        <MessageSquare className="w-8 h-8 text-primary" />
      </div>
      
      <h2 className="text-2xl font-semibold mb-3">Добро пожаловать</h2>
      <p className="text-muted-foreground max-w-md mb-8 leading-relaxed">
        Я ваш AI-помощник в подходе Мета-персональной терапии. 
        Расскажите, что вас беспокоит, или выберите подходящий сценарий из списка.
      </p>
      
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-lg">
        <div className="flex flex-col items-center gap-2 p-4 rounded-lg bg-card border border-card-border">
          <Sparkles className="w-5 h-5 text-primary" />
          <span className="text-sm font-medium">Поиск потребностей</span>
        </div>
        <div className="flex flex-col items-center gap-2 p-4 rounded-lg bg-card border border-card-border">
          <Heart className="w-5 h-5 text-primary" />
          <span className="text-sm font-medium">Работа с эмоциями</span>
        </div>
        <div className="flex flex-col items-center gap-2 p-4 rounded-lg bg-card border border-card-border">
          <Shield className="w-5 h-5 text-primary" />
          <span className="text-sm font-medium">Новые стратегии</span>
        </div>
      </div>
    </div>
  );
}
