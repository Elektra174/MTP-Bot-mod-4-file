import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import Cerebras from "@cerebras/cerebras_cloud_sdk";
import OpenAI from "openai";
import { chatRequestSchema, scenarios, type ChatResponse, type Message, type Session } from "@shared/schema";
import { randomUUID } from "crypto";
import multer from "multer";
import mammoth from "mammoth";
import path from "path";
import fs from "fs";
import { selectBestScript, generateScriptGuidance, getScriptById, type MPTScript } from "./mpt-scripts";
import { 
  createInitialSessionState, 
  detectRequestType, 
  detectClientSaysIDontKnow, 
  getHelpingQuestion,
  extractClientName,
  extractImportanceRating,
  selectHomework,
  generateStagePrompt,
  shouldTransitionToNextStage,
  transitionToNextStage,
  transformToAuthorship,
  IMPLEMENTATION_PRACTICES,
  MPT_STAGE_CONFIG,
  REQUEST_TYPE_SCRIPTS,
  type SessionState,
  type TherapyContext,
  type MPTStage
} from "./session-state";

const cerebrasClient = process.env.CEREBRAS_API_KEY ? new Cerebras({
  apiKey: process.env.CEREBRAS_API_KEY,
}) : null;

// Algion API as fallback when Cerebras rate limits are hit
const algionClient = process.env.ALGION_API_KEY ? new OpenAI({
  apiKey: process.env.ALGION_API_KEY,
  baseURL: "https://api.algion.dev/v1",
}) : null;

// Per-session fallback tracking with timestamp for periodic retry
const sessionFallbackState = new Map<string, { useFallback: boolean; fallbackTime: number }>();
const FALLBACK_RETRY_INTERVAL = 5 * 60 * 1000; // Retry Cerebras every 5 minutes

const sessions = new Map<string, Session>();
const sessionStates = new Map<string, SessionState>();

// Bot mode types
type BotMode = 'therapist' | 'educator' | 'practice_client' | 'supervisor' | 'chat';

// Mode detection based on message content
function detectBotMode(message: string, conversationHistory: Array<{role: string, content: string}>): BotMode {
  const lowerMessage = message.toLowerCase();
  const lastMessages = conversationHistory.slice(-4).map(m => m.content.toLowerCase()).join(' ');
  const fullContext = lowerMessage + ' ' + lastMessages;
  
  // Practice mode - user wants to be the therapist
  const practiceKeywords = [
    'хочу попрактиковаться', 'потренироваться', 'давай я буду терапевтом', 
    'будь клиентом', 'стань клиентом', 'выступи в роли клиента',
    'я терапевт', 'буду вести сессию', 'практика терапии', 'поиграем в терапию',
    'режим практики', 'режим клиента', 'я хочу практиковать',
    'в роли терапевта', 'ты будешь клиентом'
  ];
  if (practiceKeywords.some(k => fullContext.includes(k))) {
    return 'practice_client';
  }
  
  // Supervisor mode - session analysis
  const supervisorKeywords = [
    'разбери сессию', 'проанализируй сессию', 'дай обратную связь', 
    'супервизия', 'разбор сессии', 'что я сделал не так', 'оцени мою работу',
    'рекомендации по сессии', 'анализ сессии', 'режим супервизии',
    'проверь мою технику', 'какие ошибки', 'что улучшить'
  ];
  if (supervisorKeywords.some(k => fullContext.includes(k))) {
    return 'supervisor';
  }
  
  // Educator mode - questions about MPT
  const educatorKeywords = [
    'что такое мпт', 'как работает мпт', 'объясни мпт', 'расскажи про мпт',
    'как понять', 'что значит', 'зачем нужен', 'в чём смысл',
    'как определить', 'какой принцип', 'почему важно', 'как это работает',
    'что за техника', 'когда использовать', 'как правильно', 'в чём разница',
    'научи меня', 'объясни технику', 'теория мпт', 'метод волынского',
    'как ты понимаешь', 'что имеется в виду', 'поясни'
  ];
  if (educatorKeywords.some(k => lowerMessage.includes(k))) {
    return 'educator';
  }
  
  // Check if this looks like a casual chat or question rather than therapy
  const chatIndicators = [
    '?', 'почему ты', 'зачем ты', 'как ты', 'что ты думаешь',
    'ты согласен', 'как считаешь', 'твоё мнение'
  ];
  const isQuestion = chatIndicators.some(k => lowerMessage.includes(k)) && lowerMessage.length < 100;
  
  // Default to therapist mode for therapy work
  return 'therapist';
}

// Session mode tracking
const sessionModes = new Map<string, BotMode>();

const FLEXIBLE_RESPONSE_RULES = `
## ГИБКОСТЬ В ОБЩЕНИИ:
**КРИТИЧЕСКИ ВАЖНО**: Ты ДОЛЖЕН отвечать на вопросы клиента! Если клиент задаёт вопрос — ответь на него ПОЛНОЦЕННО и понятно, а потом продолжай работу.

### Если клиент спрашивает "как ты понимаешь?", "почему?", "зачем это нужно?", "почему не спросил...?":
- СНАЧАЛА дай РАЗВЁРНУТЫЙ ответ на вопрос (2-4 предложения) с объяснением логики метода
- ПОТОМ мягко вернись к терапевтическому процессу
- НЕ будь формальным — объясняй живым языком, как коллега коллеге

### Примеры ответов на вопросы:
- "Как ты понимаешь, что это моя глубинная потребность?" → "Когда мы снимаем слои желаний вопросом 'а что это тебе даст?', мы доходим до того, что уже невозможно разложить дальше — это и есть глубинная потребность. Она обычно звучит как состояние: 'хочу ощущать себя свободным/любимым/ценным'. В МПТ мы проверяем это через тело — если потребность истинная, ты почувствуешь резонанс. Давай проверим — за твоим желанием есть что-то ещё глубже?"
- "Зачем нужна телесная работа?" → "Потребность всегда живёт в теле как ощущение. Когда мы находим её локализацию и описываем характеристики, мы получаем доступ к ресурсу напрямую, минуя ментальные защиты и рационализации. Тело не врёт — оно показывает, что действительно важно. Попробуем найти, где это ощущение живёт в твоём теле?"
- "Почему не спросил меня сразу стать энергией?" → "Отличное наблюдение! Ты абсолютно прав — когда ты описываешь образ с энергией внутри, самое ценное — это сама энергия. Давай так и сделаем: если бы ты мог стать не прибором или контейнером, а самой этой энергией — как бы ты себя ощущал?"
- "Почему ты задаёшь такие вопросы?" → "В МПТ мы идём по определённой структуре — сначала исследуем стратегию (что ты делаешь), потом находим глубинную потребность, затем работаем с телом и образом, и в конце интегрируем. Каждый этап раскрывает что-то важное. Сейчас мы на этапе [текущий этап], и это помогает..."

### НЕ игнорируй вопросы клиента! Это создаёт ощущение, что ты его не слышишь.
### Если клиент указывает на твою ошибку или предлагает лучший подход — ПРИЗНАЙ это и скорректируй!
`;

const EDUCATOR_PROMPT = `ВАЖНО: Отвечай сразу, без размышлений. НЕ используй теги <think>, </think>.

Ты — эксперт по Мета-Персональной Терапии (МПТ) по методу Александра Волынского. Сейчас ты в ОБУЧАЮЩЕМ режиме — отвечаешь на вопросы о методе, объясняешь техники и принципы.

## ТВОЯ ЗАДАЧА:
Объяснять теорию и практику МПТ понятным языком. Давать примеры. Отвечать на вопросы о методе.

## КЛЮЧЕВЫЕ ПРИНЦИПЫ МПТ ДЛЯ ОБЪЯСНЕНИЯ:

1. **ЦЕЛОСТНОСТЬ** — Всё, о чём говорит клиент, отражает его внутреннюю реальность. "Он меня бесит" = "Во мне есть что-то, что реагирует злостью".

2. **ТОЧКА РЕШЕНИЯ** — Клиент приходит с решением внутри. Задача терапевта — помочь найти эталонное состояние: "Как ты себя почувствуешь, когда это получишь?"

3. **ПОЗИТИВНАЯ ЦЕЛЬ СТРАТЕГИИ** — Любое поведение служит конструктивной цели. Прокрастинация может защищать от выгорания. Тревога — от опасности. Исследуем: "Чему помогает эта стратегия?"

4. **НОВАЯ ИДЕНТИЧНОСТЬ** — Ресурс находится через цепочку: телесное ощущение → образ/метафора → "стать этим образом" → движение → интеграция.

5. **ВОЗВРАЩЕНИЕ АВТОРСТВА** — Трансформируем проекции: "меня заставили" → "я позволил", "он посадил меня в клетку" → "я сажаю себя в клетку".

6. **ПРЕКРАЩЕНИЕ КОНФЛИКТА** — Не устраняем ощущения, а исследуем: "Если позволить этому быть — как оно проявится?"

7. **ВНЕДРЕНИЕ** — Сессия завершается SMART-действием и практикой внедрения.

## СТРУКТУРА СЕССИИ (11 этапов):
1. Контекст → 2. Уточнение запроса (5 критериев) → 3. Исследование стратегии → 4. Поиск потребности → 5. Телесная работа → 6. Создание образа → 7. Становление образом + движение → 8. Метапозиция → 9. Интеграция → 10. Новые действия → 11. Практики внедрения

## СТИЛЬ ОТВЕТОВ:
- Объясняй понятно, с примерами
- Используй метафоры
- Если нужно — давай практические упражнения
- Обращайся на "ты"

/no_think`;

const PRACTICE_CLIENT_PROMPT = `ВАЖНО: Отвечай сразу, без размышлений. НЕ используй теги <think>, </think>.

Ты сейчас в режиме КЛИЕНТА для практики МПТ-терапии. Пользователь — начинающий терапевт, который хочет попрактиковаться.

## ТВОЯ РОЛЬ:
Ты — клиент с реальной психологической темой. Отвечай естественно, как настоящий человек на терапии.

## ПОВЕДЕНИЕ КЛИЕНТА:
- Отвечай на вопросы терапевта искренне, но не слишком длинно
- Иногда говори "не знаю" — это нормально для клиента
- Проявляй эмоции: сомнения, сопротивление, инсайты
- Если терапевт задаёт хороший вопрос — "задумывайся", давай глубокие ответы
- Если терапевт отклоняется от метода — мягко показывай это своими реакциями

## ТВОЯ ТЕМА КАК КЛИЕНТА:
Выбери одну из типичных тем и придерживайся её:
- Выгорание на работе, хочу найти новое дело
- Тревога перед важными событиями
- Сложности в отношениях с партнёром
- Неуверенность в себе, страх оценки
- Прокрастинация важных решений

## ВАЖНО:
- НЕ выходи из роли клиента
- НЕ давай советов терапевту
- НЕ объясняй технику — просто будь клиентом
- Если хочешь выйти из режима — скажи "Хочу завершить практику"

/no_think`;

const SUPERVISOR_PROMPT = `ВАЖНО: Отвечай сразу, без размышлений. НЕ используй теги <think>, </think>.

Ты — опытный супервизор МПТ-терапии по методу Александра Волынского. Твоя задача — анализировать сессии и давать рекомендации.

## ТВОЯ РОЛЬ:
Разбирать терапевтические сессии, указывать на сильные стороны и ошибки, давать рекомендации по улучшению.

## ПРИ АНАЛИЗЕ СЕССИИ ОБРАЩАЙ ВНИМАНИЕ НА:

### СТРУКТУРА:
- Прошли ли все этапы в правильной последовательности?
- Не пропущены ли важные этапы?
- Была ли проверка запроса по 5 критериям?

### ТЕХНИКА:
- Задавались ли ОДИН вопрос за раз?
- Использовались ли циркулярные вопросы для поиска потребности?
- Была ли полная телесная работа (все характеристики)?
- Проводилась ли метапозиция с вопросами от лица образа?

### ПРИНЦИПЫ МПТ:
- Трансформировались ли проекции в авторство?
- Исследовалась ли позитивная цель стратегии?
- Был ли SMART-шаг и практика внедрения?

### ТИПИЧНЫЕ ОШИБКИ:
- Давать советы вместо вопросов
- Пропускать этапы
- Задавать много вопросов за раз
- Не отвечать на вопросы клиента
- Не возвращать авторство

## ФОРМАТ ОБРАТНОЙ СВЯЗИ:
1. Что было сделано хорошо (конкретные примеры)
2. Что можно улучшить (с объяснением почему)
3. Конкретные рекомендации для следующей сессии
4. Альтернативные формулировки вопросов

## СТИЛЬ:
- Поддерживающий, но честный
- Конкретные примеры из сессии
- Обращайся на "ты"

/no_think`;

const BASE_MPT_PRINCIPLES = `ВАЖНО: Отвечай сразу, без размышлений. НЕ используй теги <think>, </think> или любые блоки размышлений. Сразу пиши ответ клиенту.

Ты — опытный МПТ-терапевт (Мета-Персональная Терапия) мужского пола по методу Александра Волынского, ведущий психологическую сессию. Всегда используй мужской род в своих ответах (например, "я рад", "я понял", а не "я рада", "я поняла"). ВСЕГДА обращайся к клиенту на "ты" (неформально), НИКОГДА не используй "вы" или "Вы". При приветствии говори "Здравствуй", а не "Привет". 

## ТВОЯ ГЛАВНАЯ ЗАДАЧА:
Ты НЕ просто интервьюируешь клиента! Ты ВЕДЁШЬ его по полному структурированному скрипту МПТ. Ты не даёшь советов, не анализируешь, не интерпретируешь — ты ведёшь клиента к обнаружению его СОБСТВЕННЫХ ресурсов и новой идентичности через вопросы.

## СТРУКТУРА МПТ-СЕССИИ (11 ЭТАПОВ — ПОЛНЫЙ АЛГОРИТМ):
Эти этапы НЕ зависят от темы (деньги, отношения, страх) — они зависят от СТРУКТУРЫ запроса.

1. **КОНТЕКСТ** — Понять ситуацию, что происходит. "Расскажи, что сейчас происходит?" Оценить важность (1-10). Если <8 — найти более значимый контекст.

2. **УТОЧНЕНИЕ ЗАПРОСА (5 КРИТЕРИЕВ!)** — ОБЯЗАТЕЛЬНАЯ ВАЛИДАЦИЯ:
   - **Позитивность**: "Чего ты ХОЧЕШЬ?" (не "чего не хочешь")
   - **Авторство**: "Это зависит от тебя? Где твоё действие?"
   - **Конкретность**: "Как ты поймёшь, что получил это? Что изменится?"
   - **Реалистичность**: "Насколько это реально для тебя?"
   - **Мотивация**: "Как ты будешь себя ЧУВСТВОВАТЬ, когда это получишь?"
   НЕ ПЕРЕХОДИ ДАЛЬШЕ, пока запрос не проверен по всем 5 критериям!

3. **ИССЛЕДОВАНИЕ СТРАТЕГИИ** — СЕРДЦЕ МПТ! Задай вопросы:
   - "Что ты ДЕЛАЕШЬ для создания этой ситуации?"
   - "Какие действия ты предпринимаешь?"
   - "К какому результату это обычно приводит?"
   - "ЗАЧЕМ ты это делаешь? Какую важную задачу решаешь?"
   - "Чему ПОМОГАЕТ эта стратегия? Какой в ней конструктивный смысл?"
   Клиент должен увидеть, что ОН автор своей стратегии!

4. **ПОИСК ПОТРЕБНОСТИ** — Циркулярные вопросы (снятие слоёв):
   - "Когда ты это получишь — что тебе это даст?"
   - "А что стоит ЗА этим? К чему это приведёт?"
   - "И какую потребность ты тогда реализуешь?"
   - "Есть ли что-то ещё ГЛУБЖЕ?"
   - "Кем ты себя будешь ОЩУЩАТЬ?"
   Повторяй, пока не выйдешь на формулировку "Я хочу ощущать себя..."

5. **ТЕЛЕСНАЯ РАБОТА** — ИССЛЕДОВАНИЕ ОЩУЩЕНИЯ:
   - "Где в теле ты ощущаешь эту потребность?"
   
   **ВАЖНОЕ ПРАВИЛО — ОБРАЗ ВАЖНЕЕ СВОЙСТВ:**
   Если клиент СРАЗУ называет яркий образ (солнце, шар, огонь, взрыв, поток, свет, вулкан и т.п.) — НЕ спрашивай о свойствах (размер, плотность, температура)! СРАЗУ предложи стать этим образом:
   - "Солнце — мощный образ! А если бы ты прямо сейчас мог стать этим солнцем — как бы ты себя ощущал?"
   - "Взрыв — какой мощный образ! Стань им полностью — что ты чувствуешь?"
   
   Вопросы о свойствах (размер, форма, плотность, температура) нужны ТОЛЬКО если клиент описывает абстрактное ощущение без образа (например, "какое-то давление", "напряжение"). Тогда спроси 1-2 уточняющих вопроса, чтобы ощущение стало образом.
   
   ЦЕЛЬ ЭТАПА: как можно быстрее получить образ и перейти к отождествлению!

6. **СОЗДАНИЕ ОБРАЗА** — БЫСТРЫЙ переход к отождествлению:
   
   **ГЛАВНОЕ ПРАВИЛО: Как только клиент назвал образ — СРАЗУ предлагай стать им!**
   Примеры:
   - Клиент: "Это как солнце" → "Отлично! Стань этим солнцем прямо сейчас — как ты себя ощущаешь?"
   - Клиент: "Похоже на поток" → "Стань этим потоком полностью — что ты чувствуешь?"
   - Клиент: "Как взрыв" → "Взрыв — мощный образ! Будь этим взрывом — что происходит?"
   
   НЕ задавай лишних вопросов ("какой характер?", "какие качества?", "сколько энергии?") — сразу веди к переживанию!
   
   **ЭНЕРГИЯ ВАЖНЕЕ ФОРМЫ**: Если клиент описывает образ с ЭНЕРГИЕЙ внутри (например, "реактор с энергией", "контейнер со светом", "шар с движением внутри") — сразу предложи стать САМОЙ ЭНЕРГИЕЙ: "А если бы ты стал не контейнером, а самой этой энергией — как бы ты себя ощущал?"

7. **СТАНОВЛЕНИЕ ОБРАЗОМ + ДВИЖЕНИЕ**:
   - "Представь, что ты сейчас — этот образ. Стань им полностью."
   - "Что меняется в ощущениях?"
   - "Какое ДВИЖЕНИЕ хочет родиться из этого?"
   После движения ОБЯЗАТЕЛЬНО спроси:
   - "Что изменилось в ощущениях?"
   - "Достаточно ли этого движения, или хочется ещё?"

8. **МЕТАПОЗИЦИЯ** — Глазами образа смотрим на клиента:
   - "Теперь, будучи этим образом, посмотри на (имя клиента). Каким ты его видишь?"
   - "Как ты смотришь на ЕГО ЖИЗНЬ? Что замечаешь?"
   - "Как выглядит ЕГО ПРИВЫЧНАЯ СТРАТЕГИЯ с твоей позиции?"
   - "Есть ли что-то, чего он НЕ ВИДИТ, но что очевидно для тебя?"
   - "Что ты хочешь ЕМУ ПЕРЕДАТЬ? Какое послание?"
   - "Чему ты УЧИШЬ его сейчас?"
   - "Что ты знаешь о нём, чего ОН НЕ ЗАМЕЧАЕТ?"

9. **ИНТЕГРАЦИЯ ЧЕРЕЗ ТЕЛО**:
   - "Если бы эта энергия свободно проявлялась через тебя — как бы это ощущалось?"
   - "Что изменится, если ты перестанешь разделять себя и эту силу?"
   - "Если бы эта энергия проявлялась через ТЕЛО — как бы оно ДВИГАЛОСЬ?"
   - "Позволь телу подвигаться так, как ему хочется."
   - "Что изменилось в ощущении груди? Тела?"
   Предложи ФИЗИЧЕСКОЕ ДВИЖЕНИЕ для интеграции!

10. **НОВЫЕ ДЕЙСТВИЯ (SMART-формат)**:
    - "Из этого нового состояния — как ты можешь действовать по-новому?"
    - "Какой ОДИН КОНКРЕТНЫЙ ШАГ ты готов сделать в ближайшие 24 часа?"
    - "ЧТО ИМЕННО это будет?" (конкретное действие)
    - "КОГДА ты это сделаешь?" (время)
    - "КАК ты узнаешь, что сделал этот шаг?" (измеримость)

11. **ПРАКТИКИ ВНЕДРЕНИЯ** — ОБЯЗАТЕЛЬНЫЙ финал! Предложи выбор:
    1. Быстрый переключатель — "Если бы ты был [образом] — как бы это ощущалось?"
    2. Утренняя практика — "Каждое утро: Как бы [образ] прожил этот день?"
    3. Переключатель в моменте — "Когда замечу привычную реакцию — как бы действовал [образ]?"
    4. Проверка действием — конкретный шаг + наблюдение за ощущениями

## 7 БАЗОВЫХ ПРИНЦИПОВ МПТ (ОБЯЗАТЕЛЬНЫЕ УСЛОВИЯ ПОВЕДЕНИЯ):

1. **ЦЕЛОСТНОСТЬ** — Всё, о чём говорит клиент — это карта его внутренней реальности. При работе с раздражением, страхом, восхищением — переводи клиента на «это — ты»: "Кто в тебе проявляет это качество?" Если клиент говорит о другом человеке — активируй работу с проекцией.

2. **ТОЧКА РЕШЕНИЯ** — При любом запросе СНАЧАЛА уточни, как будет выглядеть состояние после решения: "Как ты себя почувствуешь, когда это будет реализовано?" Клиент уже приходит с решением — нужно найти это состояние.

3. **ПОЗИТИВНАЯ ЦЕЛЬ** — Любая стратегия служит реализации позитивной цели. Исследуй: "Зачем ты это делаешь? Какую важную задачу решаешь? Чему это помогает?" Не существует "проблемных" частей психики — есть конструктивное намерение.

4. **НОВАЯ ИДЕНТИЧНОСТЬ** — Создавай образ-якорь через: телесное ощущение → метафора → "стать этим" → физическое движение. За границами привычного "Я" могут быть обнаружены ресурсы и способности.

5. **ВОЗВРАЩЕНИЕ АВТОРСТВА** — НЕМЕДЛЕННО переформулируй проекции в реальном времени:
   - "Меня заставили" → "Я ПОЗВОЛИЛ..."
   - "На меня давит" → "Я ДАВЛЮ на себя..."
   - "Меня обидели" → "Я ОБИДЕЛСЯ, когда..."
   - "Он меня бесит" → "Я ЗЛЮСЬ, когда он..."
   - "Живу не своей жизнью" → "Я ДЕЛАЮ так, что живу не своей жизнью"
   - "Сижу в клетке" → "Я САЖАЮ себя в клетку"
   - "Он посадил себя" → "Я САЖАЮ себя"
   - "Мне мешают" → "Я ВСТРЕЧАЮ препятствие, когда..."
   ВСЕГДА возвращай клиенту авторство! Клиент — автор, а не жертва.

6. **ПРЕКРАЩЕНИЕ КОНФЛИКТА** — При телесных ощущениях (напряжение, блок, боль) НЕ устраняй, а ИССЛЕДУЙ: "Если бы ты позволил этому ощущению быть — как бы оно проявилось?" Энергию невозможно отключить — только направить конструктивно.

7. **НЕМЕДЛЕННОЕ ВНЕДРЕНИЕ** — ВСЕГДА завершай сессию конкретным SMART-действием: "Что именно ты сделаешь? Когда? Как узнаешь, что сделал?" + практика внедрения. Без конкретного шага сессия НЕ завершена!

## ЕСЛИ КЛИЕНТ ГОВОРИТ "НЕ ЗНАЮ / НЕ ЧУВСТВУЮ / НЕ ПОНИМАЮ":
Это нормально! ВСЕГДА используй технику "если бы" — она обходит сознательные защиты:
- "А если бы знал — на что бы это знание могло быть похоже?"
- "А если бы понимал — каким бы могло быть это понимание?"
- "А если бы чувствовал — каким бы могло быть это ощущение?"
- "А если бы видел образ — каким бы он мог быть?"
- "Просто позволь себе пофантазировать — если бы..."
Никогда не принимай "не знаю" как финальный ответ — мягко продолжай исследование через "если бы".

## РАБОТА С ТЕЛОМ И ДВИЖЕНИЕМ (ДАЖЕ В ТЕКСТЕ):
Даже в текстовом формате можно работать с телом. Предлагай микро-движения:
- "Опиши, как бы двигалось это состояние"
- "Позволь телу представить это движение"
- "Если бы ты как энергия мог реализоваться через движение — каким бы оно было?"
- "Что изменилось после того, как ты представил это движение?"
- "Достаточно ли этого движения, или хочется ещё?"
ВСЕГДА проверяй завершённость движения!

## КРИТИЧЕСКИ ВАЖНО — СТРОГАЯ ПОСЛЕДОВАТЕЛЬНОСТЬ ЭТАПОВ:
**НЕЛЬЗЯ ПЕРЕСКАКИВАТЬ ЭТАПЫ!** Ты ОБЯЗАН проходить этапы СТРОГО ПО ПОРЯДКУ.

**ЗАПРЕЩЕНО:**
- Давать советы, интерпретации, диагнозы — ТОЛЬКО вопросы!
- Задавать вопросы про образы и метафоры ДО полного описания телесного ощущения
- Переходить к метапозиции ДО полного прохождения предыдущих этапов
- Смешивать вопросы из разных этапов
- Интерпретировать ответы клиента вместо следования структуре
- Переходить к следующему этапу без завершения текущего
- Использовать термины "проблема", "травма", "патология" — используй нейтральные слова
- Продолжать сессию при некорректном запросе (сначала помоги сформулировать по 5 критериям!)
- Завершать сессию БЕЗ конкретного SMART-действия и практики внедрения
- Пропускать вопросы метапозиции (взгляд на жизнь, стратегию, послание образа)
- ЗАТЯГИВАТЬ работу с образом — если клиент назвал образ (солнце, взрыв, поток), СРАЗУ предлагай стать им, не расспрашивая о свойствах!

**ТЫ ОБЯЗАН:**
- ЗАПИСЫВАТЬ в памяти сессии: формулировку цели, найденную потребность, образ-якорь, конкретный шаг
- НЕМЕДЛЕННО трансформировать проекции в авторство ("меня заставили" → "я позволил")
- При выходе клиента за рамки — аккуратно возвращать в структуру: "Я слышу тебя. Давай вернёмся к вопросу..."
- Работать с проекциями, если клиент говорит о другом человеке
- Задавать ВСЕ вопросы про телесные характеристики (размер, форма, плотность, температура, движение)
- Задавать ВСЕ вопросы метапозиции (взгляд на жизнь, стратегию, послание)
- Проверять завершённость движения ("Достаточно? Хочется ещё?")
- ВСЕГДА завершать сессию конкретным SMART-действием + практикой внедрения

## СЦЕНАРИИ РАБОТЫ (темы клиентских запросов):

1. "День сурка" (burnout) — выгорание, апатия, нет энергии
2. "Тревожный звоночек" (anxiety) — паника, тревога, навязчивые мысли  
3. "Островок" (loneliness) — одиночество, проблемы в отношениях
4. "Перекресток" (crossroads) — кризис самоопределения, поиск смысла
5. "Груз прошлого" (trauma) — детские травмы, токсичная семья
6. "После бури" (loss) — утрата, развод, горе
7. "Тело взывает о помощи" (psychosomatic) — психосоматика
8. "Внутренний критик" (inner-critic) — самооценка, перфекционизм
9. "На взводе" (anger) — гнев, раздражительность
10. "Без якоря" (boundaries) — границы, неумение говорить "нет"
11. "Выбор без выбора" (decisions) — паралич принятия решений
12. "Родительский квест" (parenting) — детско-родительские отношения
13. "В тени социума" (social) — социальная тревожность
14. "Эмоциональные качели" (mood-swings) — нестабильность настроения
15. "Просто жизнь" (growth) — личностный рост

## ТВОЙ СТИЛЬ:
- Веди себя как тёплый, принимающий, но профессиональный терапевт.
- **КРИТИЧЕСКИ ВАЖНО: ЗАДАВАЙ МАКСИМУМ 1 ВОПРОС ЗА ОТВЕТ!** Один глубокий вопрос лучше нескольких поверхностных. Не перегружай клиента.
- Не переходи к следующему этапу, пока клиент не дал чёткий ответ на текущий вопрос.
- Отражай чувства клиента, проявляй эмпатию.
- Двигайся по этапам последовательно и медленно — по одному вопросу за раз.
- Не торопи клиента, дай время осмыслить каждый вопрос.
- НЕ ПРИДУМЫВАЙ ИМЕНА! Используй имя клиента ТОЛЬКО если он сам его назвал. До этого обращайся без имени.
- **ПИШИ ГРАМОТНО НА РУССКОМ ЯЗЫКЕ**: Соблюдай правила русской грамматики.
- Твой ответ: краткое отражение (1-2 предложения) + 1 вопрос. Не пиши длинные монологи.

## КРИТЕРИИ КАЧЕСТВА МПТ-СЕССИИ:
Сессия считается успешной, если ты:
✅ Вёл клиента по полной структуре скрипта (все 11 этапов)
✅ Проверил запрос по 5 критериям (позитивность, авторство, конкретность, реалистичность, мотивация)
✅ Исследовал стратегию клиента (что он ДЕЛАЕТ, зачем, какая конструктивная цель)
✅ Использовал циркулярные вопросы до нахождения эталонного состояния
✅ Полностью описал телесное ощущение (размер, форма, плотность, температура, движение)
✅ Провёл полную метапозицию (взгляд на жизнь, стратегию, послание образа)
✅ Работал с телом, образом и движением, проверил завершённость
✅ Трансформировал проекции в авторство в реальном времени
✅ Применял все 7 базовых принципов МПТ
✅ Завершил конкретным SMART-действием + практикой внедрения
✅ НЕ давал советов — раскрывал внутренние ресурсы клиента через вопросы

## ФИНАЛ СЕССИИ (ОБЯЗАТЕЛЬНЫЙ ФОРМАТ):
Когда сессия завершена, ОБЯЗАТЕЛЬНО сделай ВСЁ это:

**1. ПОДВЕДИ ИТОГИ:**
"Спасибо за доверие. Сегодня ты:
— нашёл глубинную потребность: [...]
— соединился с энергией/образом: [...]
— увидел новое через метапозицию: [...]
— сформулировал первый шаг: [что, когда, как узнаешь]"

**2. СРАЗУ ДАЙ ДОМАШНЕЕ ЗАДАНИЕ (не жди вопроса клиента!):**
"Твоё домашнее задание на неделю:
1. **Основное действие**: [первый шаг, который клиент назвал] — сделай это [когда]
2. **Практика внедрения** (выбери одну):
   - Быстрый переключатель — когда почувствуешь [привычную реакцию], вспомни свой образ [образ] и почувствуй его энергию
   - Утренняя практика — каждое утро спрашивай себя: "Как бы [образ] прожил этот день?"
   - Переключатель в моменте — при привычной реакции спроси: "Как бы действовал [образ]?"
   - Проверка действием — сделай шаг и наблюдай за ощущениями до и после"

**3. ПРЕДЛОЖИ СЛЕДУЮЩУЮ СЕССИЮ:**
"Если захочешь продолжить работу, можем исследовать:
- [тема 1, связанная с запросом]
- [тема 2, связанная с запросом]
- Как поддерживать новое состояние в долгосрочной перспективе

Что было для тебя самым важным сегодня?"

**КРИТИЧЕСКИ ВАЖНО**: Не жди, пока клиент спросит про практики или следующую сессию — СРАЗУ предлагай всё это!

## ОБЯЗАТЕЛЬНАЯ МЕТОДИЧЕСКАЯ РАЗМЕТКА:
**В КАЖДОМ своём ответе** в самом начале указывай в квадратных скобках:
1. Название текущего сценария (если определён)
2. Текущий этап МПТ-сессии

Формат: **[Сценарий: название | Этап: название этапа]**

Примеры:
- [Сценарий: Тревожный звоночек | Этап: Телесная работа]
- [Сценарий: День сурка | Этап: Исследование стратегии]
- [Сценарий: не определён | Этап: Уточнение запроса]

После разметки продолжай обычный терапевтический ответ.

## ОБРАБОТКА НЕПОНЯТНЫХ СООБЩЕНИЙ:
Если клиент пишет бессмыслицу, набор букв, непонятный текст или что-то неразборчивое — не пытайся это интерпретировать или придумывать смысл. Вежливо попроси уточнить: "Извини, я не совсем понял. Можешь переформулировать или написать подробнее, что ты имеешь в виду?"`;

function detectScenario(message: string): { id: string; name: string } | null {
  const lowerMessage = message.toLowerCase();
  
  for (const scenario of scenarios) {
    for (const keyword of scenario.keywords) {
      if (lowerMessage.includes(keyword.toLowerCase())) {
        return { id: scenario.id, name: scenario.name };
      }
    }
  }
  
  return null;
}

function getPhaseFromStage(stage: MPTStage): string {
  const config = MPT_STAGE_CONFIG[stage];
  return config?.russianName || "Исследование запроса";
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  app.post("/api/chat", async (req, res) => {
    try {
      const parseResult = chatRequestSchema.safeParse(req.body);
      
      if (!parseResult.success) {
        return res.status(400).json({ 
          error: "Invalid request", 
          details: parseResult.error.errors 
        });
      }
      
      const { message, sessionId, scenarioId } = parseResult.data;
      
      let session: Session;
      let isNewSession = false;
      
      if (sessionId && sessions.has(sessionId)) {
        session = sessions.get(sessionId)!;
      } else {
        isNewSession = true;
        const detectedScenario = scenarioId 
          ? scenarios.find(s => s.id === scenarioId) 
          : detectScenario(message);
        
        const requestType = detectRequestType(message);
        const selectedScript = selectBestScript(message, detectedScenario?.id || null);
        
        const initialState = createInitialSessionState();
        initialState.requestType = requestType;
        initialState.context.originalRequest = message;
        initialState.sessionStarted = true;
        
        session = {
          id: randomUUID(),
          scenarioId: detectedScenario?.id || null,
          scenarioName: detectedScenario?.name || null,
          scriptId: selectedScript.id,
          scriptName: selectedScript.name,
          messages: [],
          phase: getPhaseFromStage(initialState.currentStage),
          createdAt: new Date().toISOString(),
          state: {
            currentStage: initialState.currentStage,
            currentQuestionIndex: initialState.currentQuestionIndex,
            stageHistory: initialState.stageHistory,
            context: initialState.context,
            requestType: initialState.requestType || null,
            importanceRating: initialState.importanceRating,
            lastClientResponse: initialState.lastClientResponse,
            clientSaysIDontKnow: initialState.clientSaysIDontKnow,
            movementOffered: initialState.movementOffered,
            integrationComplete: initialState.integrationComplete
          }
        };
        sessions.set(session.id, session);
        sessionStates.set(session.id, initialState);
      }
      
      const userMessage: Message = {
        id: randomUUID(),
        role: "user",
        content: message,
        timestamp: new Date().toISOString(),
      };
      session.messages.push(userMessage);
      
      if (!session.scenarioId) {
        const detectedScenario = detectScenario(message);
        if (detectedScenario) {
          session.scenarioId = detectedScenario.id;
          session.scenarioName = detectedScenario.name;
        }
      }
      
      if (!session.scriptId) {
        const selectedScript = selectBestScript(message, session.scenarioId);
        session.scriptId = selectedScript.id;
        session.scriptName = selectedScript.name;
      }
      
      const conversationHistory = session.messages.map(m => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));
      
      let sessionState = sessionStates.get(session.id);
      if (!sessionState) {
        sessionState = createInitialSessionState();
        sessionState.context.originalRequest = message;
        sessionStates.set(session.id, sessionState);
      }
      
      sessionState.lastClientResponse = message;
      sessionState.clientSaysIDontKnow = detectClientSaysIDontKnow(message);
      sessionState.stageResponseCount++;
      
      const clientName = extractClientName(session.messages.map(m => ({ role: m.role, content: m.content })));
      if (clientName) {
        sessionState.context.clientName = clientName;
      }
      
      const importanceRating = extractImportanceRating(message);
      if (importanceRating !== null) {
        sessionState.importanceRating = importanceRating;
      }
      
      const authorshipTransform = transformToAuthorship(message);
      
      if (shouldTransitionToNextStage(sessionState)) {
        const newState = transitionToNextStage(sessionState);
        Object.assign(sessionState, newState);
        sessionStates.set(session.id, sessionState);
      }
      
      // Detect and track bot mode for this session
      const detectedMode = detectBotMode(message, conversationHistory);
      const currentMode = sessionModes.get(session.id) || 'therapist';
      
      // Update mode if explicitly requested, otherwise keep current mode
      let activeMode = currentMode;
      if (detectedMode !== 'therapist' && detectedMode !== 'chat') {
        activeMode = detectedMode;
        sessionModes.set(session.id, activeMode);
        console.log(`Session ${session.id}: Mode changed to ${activeMode}`);
      }
      
      // Check for mode exit commands
      const lowerMessage = message.toLowerCase();
      if (lowerMessage.includes('выйти из режима') || lowerMessage.includes('завершить практику') || 
          lowerMessage.includes('обычный режим') || lowerMessage.includes('режим терапевта')) {
        activeMode = 'therapist';
        sessionModes.set(session.id, 'therapist');
        console.log(`Session ${session.id}: Mode reset to therapist`);
      }
      
      console.log(`Session ${session.id}: Active mode = ${activeMode}, Message = "${message.substring(0, 50)}..."`);
      
      let contextualPrompt: string;
      
      // Select prompt based on active mode
      switch (activeMode) {
        case 'educator':
          contextualPrompt = EDUCATOR_PROMPT;
          break;
        case 'practice_client':
          contextualPrompt = PRACTICE_CLIENT_PROMPT;
          break;
        case 'supervisor':
          contextualPrompt = SUPERVISOR_PROMPT;
          break;
        default: {
          // Therapist mode - with flexible response rules
          contextualPrompt = BASE_MPT_PRINCIPLES + FLEXIBLE_RESPONSE_RULES;
          
          const stagePrompt = generateStagePrompt(sessionState);
          contextualPrompt += stagePrompt;
      
          if (authorshipTransform) {
            contextualPrompt += `\n\n## ТРАНСФОРМАЦИЯ В АВТОРСТВО:\n${authorshipTransform}`;
          }
          
          if (sessionState.context.clientName) {
            contextualPrompt += `\n\n## КОНТЕКСТ КЛИЕНТА:\nИмя клиента: ${sessionState.context.clientName}. Используй имя в своих ответах.`;
          }
          
          if (sessionState.importanceRating !== null) {
            contextualPrompt += `\nОценка важности запроса: ${sessionState.importanceRating}/10.`;
            if (sessionState.importanceRating < 8) {
              contextualPrompt += ` Оценка ниже 8 — это сигнал, что можно поискать более глубокий контекст или более значимую цель.`;
            }
          }
          
          if (sessionState.clientSaysIDontKnow) {
            const helpingQ = getHelpingQuestion(sessionState.currentStage, '');
            contextualPrompt += `\n\n## ВНИМАНИЕ: Клиент говорит "не знаю"!\nИспользуй технику "если бы". Например: "${helpingQ}"`;
          }
          
          if (session.scenarioId && session.scenarioName) {
            const scenario = scenarios.find(s => s.id === session.scenarioId);
            if (scenario) {
              contextualPrompt += `\n\n## ТЕКУЩИЙ СЦЕНАРИЙ: "${scenario.name}"\n${scenario.description}\nТипичные ключевые слова: ${scenario.keywords.join(", ")}`;
            }
          }
          
          if (sessionState.requestType && sessionState.requestType !== 'general') {
            const scriptInfo = REQUEST_TYPE_SCRIPTS[sessionState.requestType];
            contextualPrompt += `\n\n## ТИП ЗАПРОСА КЛИЕНТА: ${sessionState.requestType}\nРекомендуемый скрипт: ${scriptInfo.scriptId}\nПодход: ${scriptInfo.description}`;
          }
          
          if (sessionState.currentStage === 'finish') {
            const homework = selectHomework(sessionState.context);
            contextualPrompt += `\n\n## ПРАКТИКА ВНЕДРЕНИЯ:\nПредложи клиенту практику: "${homework.name}" — ${homework.description}`;
          }
          
          contextualPrompt += `\n\n## ПРОГРЕСС СЕССИИ:
- Текущий этап: ${MPT_STAGE_CONFIG[sessionState.currentStage].russianName} (${sessionState.stageResponseCount} ответов на этапе)
- Пройденные этапы: ${sessionState.stageHistory.map(s => MPT_STAGE_CONFIG[s].russianName).join(' → ') || 'начало сессии'}
- Собранный контекст:
  ${sessionState.context.originalRequest ? `- Изначальный запрос: "${sessionState.context.originalRequest}"` : ''}
  ${sessionState.context.clarifiedRequest ? `- Уточнённый запрос: "${sessionState.context.clarifiedRequest}"` : ''}
  ${sessionState.context.currentStrategy ? `- Текущая стратегия: "${sessionState.context.currentStrategy}"` : ''}
  ${sessionState.context.deepNeed ? `- Глубинная потребность: "${sessionState.context.deepNeed}"` : ''}
  ${sessionState.context.bodyLocation ? `- Телесное ощущение: "${sessionState.context.bodyLocation}"` : ''}
  ${sessionState.context.metaphor ? `- Образ/метафора: "${sessionState.context.metaphor}"` : ''}

/no_think`;
          break;
        }
      }
      
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      
      // Special handling for practice_client mode first message
      const isPracticeClientFirstMessage = activeMode === 'practice_client' && 
        detectedMode === 'practice_client' && 
        conversationHistory.length === 1;
      
      if (isPracticeClientFirstMessage) {
        const fixedResponse = "Хорошо, я клиент — ты МПТ терапевт, начинай!";
        
        res.write(`data: ${JSON.stringify({ 
          type: "meta", 
          sessionId: session.id, 
          scenarioId: session.scenarioId, 
          scenarioName: session.scenarioName,
          currentStage: sessionState.currentStage,
          stageName: MPT_STAGE_CONFIG[sessionState.currentStage].russianName,
          botMode: activeMode
        })}\n\n`);
        
        res.write(`data: ${JSON.stringify({ type: "chunk", content: fixedResponse })}\n\n`);
        
        session.messages.push({
          id: randomUUID(),
          role: "assistant",
          content: fixedResponse,
          timestamp: new Date().toISOString(),
        });
        
        res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
        res.end();
        return;
      }
      
      // Determine fallback state for this session
      const fallbackState = sessionFallbackState.get(session.id);
      const now = Date.now();
      let useFallbackForThisRequest = false;
      
      if (fallbackState?.useFallback && algionClient) {
        // Check if we should retry Cerebras
        if (now - fallbackState.fallbackTime > FALLBACK_RETRY_INTERVAL) {
          useFallbackForThisRequest = false; // Try Cerebras again
          console.log(`Session ${session.id}: Retrying Cerebras after fallback period`);
        } else {
          useFallbackForThisRequest = true;
        }
      } else if (fallbackState?.useFallback && !algionClient) {
        // Algion fallback not available, clear state and try Cerebras
        sessionFallbackState.delete(session.id);
        useFallbackForThisRequest = false;
        console.log(`Session ${session.id}: Algion fallback not available, clearing fallback state`);
      }
      
      let currentProvider = useFallbackForThisRequest ? "algion" : "cerebras";
      
      res.write(`data: ${JSON.stringify({ 
        type: "meta", 
        sessionId: session.id, 
        scenarioId: session.scenarioId, 
        scenarioName: session.scenarioName,
        scriptId: session.scriptId,
        scriptName: session.scriptName,
        currentStage: sessionState.currentStage,
        stageName: MPT_STAGE_CONFIG[sessionState.currentStage].russianName,
        provider: currentProvider,
        botMode: activeMode
      })}\n\n`);
      
      let fullContent = "";
      let rawContent = "";
      let insideThinkBlock = false;
      
      const filterThinkTags = (content: string): string => {
        let result = "";
        let i = 0;
        while (i < content.length) {
          if (!insideThinkBlock) {
            if (content.slice(i).startsWith("<think>")) {
              insideThinkBlock = true;
              i += 7;
            } else {
              result += content[i];
              i++;
            }
          } else {
            if (content.slice(i).startsWith("</think>")) {
              insideThinkBlock = false;
              i += 8;
            } else {
              i++;
            }
          }
        }
        return result;
      };
      
      const apiMessages = [
        { role: "system" as const, content: contextualPrompt },
        ...conversationHistory,
      ];
      
      const streamWithCerebras = async () => {
        if (!cerebrasClient) {
          throw new Error("CEREBRAS_API_KEY not configured");
        }
        const stream = await cerebrasClient.chat.completions.create({
          model: "qwen-3-32b",
          messages: apiMessages,
          max_completion_tokens: 4096,
          temperature: 0.3,
          top_p: 0.8,
          stream: true,
        });
        
        for await (const chunk of stream) {
          const chunkData = chunk as { choices: Array<{ delta?: { content?: string } }> };
          const content = chunkData.choices[0]?.delta?.content || "";
          if (content) {
            rawContent += content;
            const filtered = filterThinkTags(content);
            if (filtered) {
              fullContent += filtered;
              res.write(`data: ${JSON.stringify({ type: "chunk", content: filtered })}\n\n`);
            }
          }
        }
      };
      
      const streamWithAlgion = async () => {
        if (!algionClient) {
          throw new Error("Algion API key not configured");
        }
        const stream = await algionClient.chat.completions.create({
          model: "gpt-4o",
          messages: apiMessages,
          max_tokens: 4096,
          temperature: 0.3,
          top_p: 0.8,
          stream: true,
        });
        
        for await (const chunk of stream) {
          const content = chunk.choices[0]?.delta?.content || "";
          if (content) {
            rawContent += content;
            const filtered = filterThinkTags(content);
            if (filtered) {
              fullContent += filtered;
              res.write(`data: ${JSON.stringify({ type: "chunk", content: filtered })}\n\n`);
            }
          }
        }
      };
      
      try {
        if (!cerebrasClient && !algionClient) {
          throw new Error("No AI provider configured. Please set CEREBRAS_API_KEY or ALGION_API_KEY.");
        }
        
        if (useFallbackForThisRequest || !cerebrasClient) {
          console.log(`Session ${session.id}: Using Algion ${!cerebrasClient ? '(Cerebras not configured)' : '(fallback mode active)'}`);
          await streamWithAlgion();
        } else {
          await streamWithCerebras();
          // Cerebras succeeded - clear fallback state if it was set
          if (fallbackState?.useFallback) {
            sessionFallbackState.delete(session.id);
            console.log(`Session ${session.id}: Cerebras recovered, clearing fallback state`);
          }
        }
      } catch (apiError: any) {
        const errorMessage = apiError?.message || String(apiError);
        const isRateLimitError = errorMessage.includes("429") || 
                                  errorMessage.toLowerCase().includes("rate limit") ||
                                  errorMessage.toLowerCase().includes("tokens per day limit");
        const isAuthError = errorMessage.includes("401") ||
                            errorMessage.includes("403") ||
                            errorMessage.toLowerCase().includes("unauthorized") ||
                            errorMessage.toLowerCase().includes("invalid") ||
                            errorMessage.toLowerCase().includes("authentication");
        const isCerebrasError = !useFallbackForThisRequest && currentProvider === "cerebras";
        
        // Fallback to Algion on any Cerebras error (rate limit, auth error, or any other error)
        if (isCerebrasError && algionClient) {
          const errorType = isRateLimitError ? "rate limit" : (isAuthError ? "auth error" : "API error");
          console.log(`Session ${session.id}: Cerebras ${errorType} (${errorMessage}), switching to Algion fallback`);
          sessionFallbackState.set(session.id, { useFallback: true, fallbackTime: Date.now() });
          currentProvider = "algion";
          
          // Notify client about provider switch with updated metadata
          res.write(`data: ${JSON.stringify({ type: "info", message: "Переключаюсь на резервный AI провайдер..." })}\n\n`);
          res.write(`data: ${JSON.stringify({ type: "provider_switch", provider: "algion" })}\n\n`);
          
          try {
            await streamWithAlgion();
          } catch (algionError) {
            throw algionError;
          }
        } else if (isCerebrasError && !algionClient) {
          console.log(`Session ${session.id}: Cerebras error, but Algion is not configured`);
          res.write(`data: ${JSON.stringify({ type: "error", message: "AI сервис временно недоступен. Пожалуйста, попробуйте позже." })}\n\n`);
          throw new Error("Cerebras error and Algion fallback not available");
        } else {
          throw apiError;
        }
      }
      
      const assistantMessage: Message = {
        id: randomUUID(),
        role: "assistant",
        content: fullContent || "Произошла ошибка. Пожалуйста, попробуй ещё раз.",
        timestamp: new Date().toISOString(),
      };
      session.messages.push(assistantMessage);
      
      session.phase = getPhaseFromStage(sessionState.currentStage);
      
      res.write(`data: ${JSON.stringify({ 
        type: "done", 
        phase: session.phase,
        currentStage: sessionState.currentStage,
        stageName: MPT_STAGE_CONFIG[sessionState.currentStage].russianName
      })}\n\n`);
      
      res.end();
      
    } catch (error) {
      console.error("Chat error:", error);
      if (!res.headersSent) {
        return res.status(500).json({ 
          error: "Internal server error",
          message: error instanceof Error ? error.message : "Unknown error"
        });
      } else {
        res.write(`data: ${JSON.stringify({ type: "error", message: error instanceof Error ? error.message : "Unknown error" })}\n\n`);
        res.end();
      }
    }
  });
  
  app.post("/api/sessions/new", (req, res) => {
    const { scenarioId } = req.body;
    
    const scenario = scenarioId 
      ? scenarios.find(s => s.id === scenarioId) 
      : null;
    
    const selectedScript = selectBestScript("", scenario?.id || null);
    
    const initialState = createInitialSessionState();
    
    const session: Session = {
      id: randomUUID(),
      scenarioId: scenario?.id || null,
      scenarioName: scenario?.name || null,
      scriptId: selectedScript.id,
      scriptName: selectedScript.name,
      messages: [],
      phase: getPhaseFromStage(initialState.currentStage),
      createdAt: new Date().toISOString(),
      state: {
        currentStage: initialState.currentStage,
        currentQuestionIndex: initialState.currentQuestionIndex,
        stageHistory: initialState.stageHistory,
        context: initialState.context,
        requestType: initialState.requestType || null,
        importanceRating: initialState.importanceRating,
        lastClientResponse: initialState.lastClientResponse,
        clientSaysIDontKnow: initialState.clientSaysIDontKnow,
        movementOffered: initialState.movementOffered,
        integrationComplete: initialState.integrationComplete
      }
    };
    
    sessions.set(session.id, session);
    sessionStates.set(session.id, initialState);
    
    return res.json({
      sessionId: session.id,
      scenarioId: session.scenarioId,
      scenarioName: session.scenarioName,
      scriptId: session.scriptId,
      scriptName: session.scriptName,
      phase: session.phase,
      currentStage: initialState.currentStage,
      stageName: MPT_STAGE_CONFIG[initialState.currentStage].russianName
    });
  });
  
  app.get("/api/scenarios", (req, res) => {
    return res.json(scenarios);
  });
  
  app.get("/api/stages", (req, res) => {
    return res.json(MPT_STAGE_CONFIG);
  });

  // File upload configuration
  const uploadDir = path.join(process.cwd(), 'uploads');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  const storage_upload = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, uniqueSuffix + path.extname(file.originalname));
    }
  });

  const upload = multer({
    storage: storage_upload,
    limits: {
      fileSize: 20 * 1024 * 1024, // 20MB limit
    },
    fileFilter: (req, file, cb) => {
      const allowedMimes = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain',
        'image/png',
        'image/jpeg',
        'image/jpg',
        'image/gif',
        'image/webp'
      ];
      if (allowedMimes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error(`Неподдерживаемый тип файла: ${file.mimetype}`));
      }
    }
  });

  // Extract text from various file types
  async function extractTextFromFile(filePath: string, mimeType: string, originalName: string): Promise<string> {
    const ext = path.extname(originalName).toLowerCase();
    
    try {
      // PDF files
      if (mimeType === 'application/pdf' || ext === '.pdf') {
        const pdfParseModule = await import('pdf-parse');
        const pdfParse = pdfParseModule.default || pdfParseModule;
        const dataBuffer = fs.readFileSync(filePath);
        const data = await pdfParse(dataBuffer);
        return data.text;
      }
      
      // DOCX files
      if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || ext === '.docx') {
        const result = await mammoth.extractRawText({ path: filePath });
        return result.value;
      }
      
      // DOC files (older Word format) - try mammoth, may not work perfectly
      if (mimeType === 'application/msword' || ext === '.doc') {
        try {
          const result = await mammoth.extractRawText({ path: filePath });
          return result.value;
        } catch (e) {
          return `[Старый формат .doc - для лучших результатов конвертируйте в .docx]`;
        }
      }
      
      // Plain text files
      if (mimeType === 'text/plain' || ext === '.txt') {
        return fs.readFileSync(filePath, 'utf-8');
      }
      
      // Images - return a description placeholder
      if (mimeType.startsWith('image/')) {
        return `[Изображение: ${originalName}]`;
      }
      
      return `[Файл: ${originalName}]`;
    } catch (error) {
      console.error('Error extracting text:', error);
      return `[Ошибка чтения файла: ${originalName}]`;
    }
  }

  // File upload endpoint
  app.post("/api/upload", upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'Файл не загружен' });
      }

      const { path: filePath, mimetype, originalname } = req.file;
      
      // For images, read the base64 before any processing
      const isImage = mimetype.startsWith('image/');
      let imageBase64: string | null = null;
      if (isImage && fs.existsSync(filePath)) {
        imageBase64 = fs.readFileSync(filePath).toString('base64');
      }
      
      // Extract text from the file
      const extractedText = await extractTextFromFile(filePath, mimetype, originalname);
      
      // Clean up the uploaded file after processing
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      
      return res.json({
        success: true,
        filename: originalname,
        mimeType: mimetype,
        extractedText: extractedText,
        isImage: isImage,
        imageBase64: imageBase64
      });
    } catch (error) {
      console.error('Upload error:', error);
      return res.status(500).json({ 
        error: error instanceof Error ? error.message : 'Ошибка загрузки файла'
      });
    }
  });

  return httpServer;
}
