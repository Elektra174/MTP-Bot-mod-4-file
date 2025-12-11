# MPT Therapist Chatbot

## Overview

This is an AI-powered therapeutic chatbot application implementing Meta-Personal Therapy (MPT) methodology. The application provides psychological support through structured therapeutic scenarios and free-form consultations, utilizing the Cerebras AI API for natural language processing.

The system guides users through evidence-based therapeutic protocols including work with burnout, anxiety management, relationship difficulties, and self-identity crises. It follows strict MPT methodology principles focused on identifying deep needs, working with bodily sensations and emotions, and developing constructive strategies.

## Recent Changes (December 11, 2025)

**File Upload & Large Text Support (Latest)**:
- **Fixed 413 error**: Increased body size limit to 50MB for large text messages
- **File attachments**: Added file upload button (paperclip icon) in chat input
- **Supported file types**: PDF, DOC, DOCX, TXT, PNG, JPEG, GIF, WEBP
- **Text extraction**: Automatically extracts text from documents using mammoth (DOCX) and pdf-parse (PDF)
- **Image support**: Images are attached with placeholder text (vision support can be added)
- **File size limit**: 20MB per file

## Previous Changes (December 10, 2025)

**Therapist Bot Improvements**:
- **Enhanced session finale**: Bot now PROACTIVELY offers homework assignments and practice recommendations at the end of each session (without waiting for client to ask)
- **Next session suggestions**: Bot now automatically proposes topics for follow-up sessions
- **Energy-first metaphor work**: When client describes an image with energy inside (e.g., "reactor with energy", "container with light"), bot now suggests becoming the ENERGY directly rather than the external form
- **Better question handling**: Improved responses to client questions about methodology - more natural, explanatory answers with acknowledgment when client suggests better approaches
- **Flexible response rules expanded**: Added examples for handling "why didn't you ask...?" type questions

**Practice Mode Updates**:
- Changed practice mode trigger message to: "Хочу попрактиковаться в роли терапевта, а ты будешь клиентом."
- Fixed initial response to: "Хорошо, я клиент — ты МПТ терапевт, начинай!"
- Added special handling to return fixed response on practice mode activation

**Session Persistence for Work Modes**:
- Mode sessions (Обучение МПТ, Практика терапии, Супервизия) now save to localStorage
- When clicking a mode, continues from existing session if one exists
- Each mode shows "Продолжить..." when a saved session exists
- Added reset button (rotate icon) per mode to clear and start fresh
- Session history displays correct mode names
- Data persists across browser sessions and page reloads

**UI/UX Improvements**:
- Made "Режимы работы" (Work modes) a collapsible dropdown in sidebar
- Added "Очистить" (Clear) button to session history for clearing all history at once
- Fixed mobile header layout - hides phase badge on small screens, compact button with icon only
- Improved responsive design for session header to prevent overlap on mobile devices

**Multi-Mode Bot Implementation**: Added 4 operational modes with automatic mode detection
- **Therapist Mode** (default): Conducts MPT therapy sessions with clients
- **Educator Mode**: Answers questions about MPT methodology and theory
- **Practice Client Mode**: Bot acts as a client so users can practice therapy skills
- **Supervisor Mode**: Analyzes therapy sessions and provides recommendations

**Flexible Response System**: Bot can now understand context and respond naturally
- Added FLEXIBLE_RESPONSE_RULES to therapist mode for answering client questions mid-session
- Mode detection based on message keywords (e.g., "что такое МПТ", "хочу попрактиковаться")
- Per-session mode tracking with ability to switch modes
- Mode exit commands to return to therapist mode

**AI Provider Fallback**: Automatic switching from Cerebras to Algion on any API error
- 5-minute fallback period before retrying Cerebras
- Graceful degradation ensures continuous service

**UI Updates**: Mode selection buttons added to sidebar (now collapsible)
- "Обучение МПТ" for educator mode
- "Практика терапии" for practice client mode  
- "Супервизия" for supervisor mode

**Previous Changes (December 08, 2025)**

**Project Import Completed**: Successfully imported GitHub repository and configured for Replit environment
- Installed all npm dependencies (508 packages including React, Express, Tailwind, Radix UI, Cerebras SDK)
- Created .gitignore file for Node.js project with proper exclusions
- Verified Vite configuration already has Replit proxy compatibility (allowedHosts: true)
- Configured development workflow "Start application" running on port 5000 with webview output
- Configured CEREBRAS_API_KEY and ALGION_API_KEY environment secrets for AI services

**Status**: Application is fully functional with multi-mode support. The MPT Therapist chatbot supports therapy sessions, methodology education, therapist practice, and session supervision.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework**: React with TypeScript running on Vite for fast development and optimized production builds.

**UI Component System**: shadcn/ui components built on Radix UI primitives, following Material Design 3 principles adapted for therapeutic environments. The design emphasizes:
- Professional therapeutic aesthetic with calming visual language
- Clear information hierarchy optimized for extended reading sessions
- Minimal cognitive load to maintain focus on therapeutic content
- Inter font family for excellent readability

**State Management**: 
- React Query (@tanstack/react-query) for server state management and API interactions
- Local React state with hooks for component-level state
- Session state persisted in-memory on the server side

**Routing**: Single-page application with component-based navigation. Primary routes handled through conditional rendering rather than traditional routing library.

**Styling**: 
- Tailwind CSS with custom design tokens defined in CSS variables
- Dark/light theme support via ThemeProvider context
- Consistent spacing system using Tailwind units (3, 4, 6, 8, 12, 16)
- Custom shadows and elevation effects for Material Design feel

### Backend Architecture

**Framework**: Express.js server with TypeScript

**API Structure**: RESTful API with primary endpoint `/api/chat` for streaming therapeutic conversations

**Session Management**: In-memory Map-based session storage tracking:
- Conversation history (messages array)
- Current therapeutic phase
- Selected scenario context
- Session timestamps

**AI Integration**: Cerebras Cloud SDK client configured with:
- Model: qwen-3-32b
- Streaming responses for real-time interaction
- Temperature: 0.6, Top-p: 0.95 for balanced creativity
- Max completion tokens: 16,382

**Therapeutic Logic**: 
- Comprehensive MPT system prompt embedding therapeutic methodology
- Scenario-based conversation flows with 15 predefined therapeutic scenarios including:
  - Burnout and emotional exhaustion
  - Anxiety and panic attacks
  - Loneliness and social isolation
  - Relationship difficulties
  - Loss and grief
  - Trauma recovery
  - Self-esteem and identity crises
  - And more specialized scenarios
- Phase tracking through therapeutic process (initial → goals → needs → energy → metaposition → integration → actions → closing)
- Circular questioning techniques to identify deep needs

### Data Storage Solutions

**Current Implementation**: In-memory storage using JavaScript Map objects for:
- User data (minimal authentication structure in place)
- Active chat sessions
- Message history

**Database Configuration**: Drizzle ORM configured for PostgreSQL with schema defined but not actively used in current implementation. Database migration setup exists for future persistence requirements.

**Schema Design** (defined but not implemented):
- Users table with UUID primary keys
- Potential for sessions and messages tables to persist therapeutic history

### Authentication and Authorization

**Current State**: Basic authentication structure defined but not enforced. The system includes:
- User schema with username/password fields
- Storage interface for user CRUD operations
- No active authentication middleware in request pipeline

**Future Consideration**: Session-based authentication with express-session configured via connect-pg-simple for PostgreSQL-backed sessions (package installed but not implemented).

### Design System Integration

**Component Library**: Full shadcn/ui component suite including:
- Form components (input, textarea, select, checkbox, radio)
- Layout components (card, dialog, popover, sheet, sidebar)
- Feedback components (toast, alert, progress)
- Navigation components (tabs, accordion, breadcrumb)

**Responsive Design**: Mobile-first approach with:
- useIsMobile hook for breakpoint detection (768px)
- Sidebar component with mobile sheet variant
- Adaptive spacing and typography scales

**Accessibility**: Components built on Radix UI primitives ensuring:
- Keyboard navigation support
- ARIA attributes for screen readers
- Focus management and visual indicators

### Build and Development

**Development Server**: Vite dev server with HMR (Hot Module Replacement) via WebSocket at `/vite-hmr`
- Command: `npm run dev` 
- Runs on port 5000 bound to 0.0.0.0 for Replit compatibility
- TypeScript execution via tsx for hot reloading

**Production Build**: 
- Client: Vite builds to `dist/public`
- Server: esbuild bundles TypeScript to `dist/index.cjs` with selective dependency bundling
- Build script uses allowlist approach for critical dependencies to reduce cold start times
- Command: `npm run build`

**Production Deployment**:
- Command: `npm start` (runs NODE_ENV=production node dist/index.cjs)
- Deployment target: Autoscale (stateless web application)
- Serves static files from dist/public and handles API requests

**Development Tools**:
- Replit-specific plugins for cartographer and dev banner (environment-conditional)
- Runtime error overlay for improved debugging
- TypeScript strict mode enabled across entire codebase

## External Dependencies

### AI Services
- **Cerebras Cloud SDK** (@cerebras/cerebras_cloud_sdk): Primary LLM provider for therapeutic conversations
  - API key configured via `CEREBRAS_API_KEY` environment variable
  - Model: qwen-3-235b-a22b-instruct-2507
  - Streaming completion API for real-time responses
- **Algion API**: Fallback LLM provider when Cerebras rate limits are hit
  - API key configured via `ALGION_API_KEY` environment variable
  - Uses OpenAI-compatible API at https://api.algion.dev/v1
  - Model: gpt-4o
  - Automatically switches back to Cerebras after 5 minutes

### Database
- **PostgreSQL**: Configured via `DATABASE_URL` environment variable (Drizzle expects this to be provisioned)
- **Drizzle ORM**: Type-safe database toolkit with schema defined in `shared/schema.ts`
- **connect-pg-simple**: PostgreSQL session store adapter (installed but not active)

### UI Framework Dependencies
- **Radix UI**: Headless component primitives for accessibility-first components
- **Tailwind CSS**: Utility-first CSS framework with custom configuration
- **class-variance-authority**: Type-safe variant styling for component variations
- **Lucide React**: Icon library for consistent visual language

### Form Management
- **React Hook Form**: Via @hookform/resolvers integration with Zod schemas
- **Zod**: Runtime type validation for request/response schemas
- **drizzle-zod**: Schema generation from Drizzle tables

### Development Dependencies
- **Vite**: Frontend build tool and dev server
- **esbuild**: Server-side TypeScript compilation for production
- **tsx**: TypeScript execution for development server

### Utility Libraries
- **date-fns**: Date formatting and manipulation
- **nanoid**: Unique ID generation for sessions and messages
- **clsx + tailwind-merge**: Conditional className utilities

### Planned/Optional Integrations
- Authentication providers (passport infrastructure exists)
- Email services (nodemailer installed)
- Payment processing (stripe installed but unused)
- File uploads (multer installed but unused)