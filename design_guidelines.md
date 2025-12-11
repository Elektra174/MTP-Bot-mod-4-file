# MPT Therapist Chatbot - Design Guidelines

## Design Approach

**Selected Approach**: Design System - Material Design 3 (therapy-focused adaptation)
**Rationale**: This therapeutic tool requires trustworthiness, clarity, and focus. Material Design 3's emphasis on readability, accessibility, and structured information hierarchy aligns perfectly with professional therapy contexts.

**Core Principles**:
- Professional therapeutic environment aesthetic
- Clear information hierarchy for long conversation flows
- Minimal cognitive load - focus stays on therapeutic content
- Calming, trustworthy visual language

---

## Typography

**Font Stack**: 
- Primary: 'Inter' (Google Fonts) - excellent readability for extended reading sessions
- Monospace: 'JetBrains Mono' (for system messages/metadata only)

**Hierarchy**:
- H1: 2xl font-semibold (Session headers, scenario titles)
- H2: xl font-medium (Phase/stage indicators)
- H3: lg font-medium (Question prompts)
- Body: base font-normal leading-relaxed (all conversation text)
- Small: sm font-normal (timestamps, metadata)
- Caption: xs font-normal (helper text, session info)

---

## Layout System

**Spacing Units**: Tailwind units of 3, 4, 6, 8, 12, 16
- Consistent use of p-4, p-6, p-8 for component padding
- gap-4, gap-6 for flex/grid spacing
- my-6, my-8 for vertical rhythm

**Container Strategy**:
- Main chat area: max-w-4xl mx-auto (optimal reading width for therapeutic dialogue)
- Sidebar panels: w-80 fixed width
- Message bubbles: max-w-2xl for comfortable reading

---

## Component Library

### Layout Components

**Main Application Shell**:
- Split-screen layout: Sidebar (scenario selection) + Main chat area
- Sidebar: Fixed left panel (w-80) with scenario list, session controls
- Chat area: Scrollable conversation thread with input at bottom
- Header: Compact top bar with session status, current scenario indicator

**Chat Interface**:
- Message bubbles: Distinct styling for therapist vs. client messages
- Therapist messages: Align left, slightly rounded corners (rounded-lg)
- Client messages: Align right, fully rounded (rounded-2xl)
- Session phase indicators: Subtle dividers between therapeutic stages
- Typing indicator: Minimal animated dots during AI response

### Navigation & Controls

**Sidebar Navigation**:
- Collapsible sections for 15 scenarios grouped by theme
- Active scenario: Highlighted with subtle background
- "New Session" prominent button at top
- Session history list at bottom

**Session Controls**:
- Start/End session toggle
- Pause/Resume options
- Export session transcript button
- Emergency resources quick link (always visible)

### Forms & Input

**Message Input Area**:
- Multi-line textarea with auto-expand
- Send button with keyboard shortcut indicator (Enter)
- Attachment option for sharing thoughts in written form
- Character counter for longer reflections

**Initial Request Formulation**:
- Structured form with guided prompts
- Radio buttons for scenario pre-selection (optional)
- Importance rating scale (1-10) as slider with visual feedback
- Multi-step wizard feel for thorough initial assessment

### Data Display

**Conversation Thread**:
- Clear timestamp formatting (relative: "2 minutes ago")
- Session phase headers: Bold, uppercase, with subtle background
- Question prompts: Slightly emphasized with left border accent
- Therapeutic scripts: Displayed as structured steps/checklist

**Session Summary Card**:
- Compact card showing current phase, time elapsed, questions covered
- Progress indicator for multi-step processes
- Key insights/notes section (collapsible)

### Feedback & Status

**Session Status Indicators**:
- Current phase badge (e.g., "Investigating Goals", "Integration Phase")
- Progress bar for multi-stage scenarios
- Unobtrusive notification for auto-saved responses

**Error States**:
- Gentle error messages (never alarming)
- Connection issues: Calm retry mechanism
- Validation feedback: Supportive, non-critical tone

---

## Interaction Patterns

**Chat Flow**:
- Smooth scroll to new messages
- Auto-scroll disabled when user scrolls up (reviewing history)
- Return to bottom button when scrolled up

**Scenario Selection**:
- Click scenario → Confirmation modal → Begin session
- Brief scenario description shown on hover
- Free-form mode: Separate clearly marked option

**Session Management**:
- Auto-save draft responses every 30 seconds
- Export conversation as PDF/TXT
- Clear session end confirmation

---

## Accessibility

- All interactive elements: min-height of 44px (touch target)
- Focus indicators: Visible 2px outline on all interactive elements
- Keyboard navigation: Full support with logical tab order
- ARIA labels: Comprehensive for screen readers
- Text contrast: WCAG AAA for all body text

---

## Images

**No hero images needed** - This is a functional therapeutic tool, not a marketing site.

**Optional illustrations**:
- Scenario icons: Simple, calming abstract icons (from Heroicons or similar)
- Empty state: Gentle illustration when starting new session ("Begin your journey")
- Loading states: Minimal, non-distracting animations

---

## Animations

**Minimal, purposeful only**:
- Message appear: Gentle fade-in (150ms)
- Typing indicator: Subtle pulse
- Transitions: 200ms ease for state changes
- NO scroll animations, parallax, or decorative motion