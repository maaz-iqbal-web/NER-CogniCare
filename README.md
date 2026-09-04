# NER CogniCare

**AI-assisted cognitive gaming and memory support for elderly dementia care in the North Eastern Region (NER).**

NER CogniCare is a web-based platform designed to make cognitive activities, memory assistance, daily reminders and caregiver support easier to access for elderly users.

The system focuses on one simple idea:

> **The system adapts to the person — the person doesn't have to adapt to the system.**

## What CogniCare Does

CogniCare combines cognitive activities with a personal context layer so that the experience can change according to the user's previous activity and preferences.

The platform includes:

- Cognitive games for memory, attention, sequencing and recognition
- Difficulty adjustment based on the user's own recent performance
- Personalized activity recommendations
- Memory and routine assistance
- Daily reminders for medication, hydration, appointments and tasks
- AI Memory Companion for conversational assistance
- Caregiver dashboard with performance trends and observations
- Multilingual interface support
- Voice input and optional spoken responses
- Offline-first support for low-connectivity environments
- Patient profiles with personal preferences and caregiver-provided information

## Cognitive Activities

The current version includes 10 activities covering different cognitive skills:

- Memory Match
- Pattern Recall
- Attention & Focus
- Daily Routine Recall
- Find the Change
- Grocery Basket
- Where Does It Belong?
- Who Is Missing?
- What Happened First?
- Odd One Out

Each completed activity records useful session information such as accuracy, score, response time, attempts, hints and errors.

## Adaptive Difficulty

Difficulty is not based on a fixed level for everyone.

CogniCare keeps a separate performance history for each person and activity. Recent results are used to adjust the next round between five difficulty levels.

For example, stronger recent performance can lead to a slightly more challenging round, while weaker performance can reduce the difficulty.

The system also considers:

- Recent accuracy
- Time since the activity was last played
- Repeated error patterns
- The type of cognitive activity involved
- The activity played most recently

The goal is to keep activities challenging without making them unnecessarily difficult.

## AI Memory Companion

The AI Companion provides a conversational interface for the user.

It can use the information available in the user's profile and recent activity context to help with things such as:

- Personal memories
- Daily routines
- Reminders
- Recent activity and progress
- Suggested activities
- General navigation and assistance

When an OpenAI API key is configured, the application can use the OpenAI Responses API for conversational responses.

If the API is unavailable, CogniCare can fall back to a local rule-based assistant so that the core application remains usable.

The AI is designed to work only with trusted information available to the application and does not diagnose dementia or make medical diagnoses.

## Caregiver Dashboard

The caregiver dashboard provides a view of the user's activity history and progress.

It includes:

- Session history
- Game-by-game performance
- Accuracy and response trends
- 7, 30 and 90-day views
- Recent activity
- Error patterns
- AI-assisted observations
- Caregiver notes
- Reminders
- Engagement streaks
- Printable caregiver reports

The dashboard is protected by a server-side caregiver PIN.

## Language & Voice

CogniCare currently supports interface translations for:

- English
- Hindi
- Assamese
- Bengali

The interface is designed around language-first onboarding, with voice input available through the browser's speech recognition capabilities.

Spoken responses can also be enabled where supported by the browser.

## Offline Support

The application is designed with low-connectivity environments in mind.

The frontend uses a service worker to cache the application shell. Selected actions performed while offline can be queued locally and synchronized when connectivity returns.

This allows cognitive activities and basic application functionality to remain useful even when a reliable internet connection is unavailable.

## Technology Stack

| Area | Technology |
|------|------------|
| Backend | Python, Flask |
| Database | SQLite |
| Frontend | HTML, CSS, JavaScript |
| AI | OpenAI Responses API + local fallback |
| Voice | Browser Speech Recognition / Speech Synthesis |
| Offline Support | Service Worker + local browser storage |
| Authentication | Server-side caregiver PIN |
| Environment | Python virtual environment |

## Project Structure

```text
NER-CogniCare/
│
├── app.py
├── requirements.txt
├── README.md
├── .env.example
├── .gitignore
├── start.bat
│
├── core/
│   ├── __init__.py
│   ├── adaptive_ai.py
│   ├── ai_service.py
│   ├── database.py
│   └── translations.py
│
├── static/
│   ├── app.js
│   ├── style.css
│   └── sw.js
│
└── templates/
    ├── base.html
    ├── index.html
    ├── caregiver.html
    ├── games.html
    ├── memory.html
    └── patient.html
