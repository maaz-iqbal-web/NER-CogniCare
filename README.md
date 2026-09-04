# NER CogniCare v4

AI-powered cognitive gaming and memory assistance prototype for elderly dementia care in the North Eastern Region (NER).

## Run on port 5050

```powershell
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

Open: http://127.0.0.1:5050

## Real AI

The app is local, but that does **not** prevent AI. Your browser talks to the Flask backend locally; the backend can then call an external AI provider. For real conversational AI, copy `.env.example` to `.env` and set `OPENAI_API_KEY`.

Example:

```powershell
copy .env.example .env
```

Then edit `.env` and add your key. Restart Flask after changing it.

If no key is present, the app still works with a privacy-friendly local rule-based assistant, clearly labelled as Local Assistant. Games, memories, reminders and analytics do not require internet.

## v4 highlights

- Port 5050
- Lighter lavender/purple visual system
- Larger primary navigation cards
- Single consistent AI button + full AI companion modal
- Real OpenAI Responses API integration when configured, with local fallback
- Patient-aware AI context with grounded-memory rules
- Voice input using the browser and optional spoken replies
- 10 fully playable cognitive activities
- Detailed game telemetry: accuracy, attempts, wrong selections, response time, hints, difficulty and errors
- AI-driven activity recommendation and explainable caregiver observations
- Today vs usual + 7/30/90-day trends
- Synthetic starter profiles plus fresh patient creation
- NER language-first onboarding
- Dementia-friendly navigation and calm motion
- No diagnostic claims; caregiver analytics compare a person with their own history


## Run
1. Create and activate `.venv`: `python -m venv .venv` then `.venv\Scripts\activate` on Windows.
2. Install: `python -m pip install -r requirements.txt`.
3. Copy `.env.example` to `.env` and add your API key if you want cloud AI.
4. Start: `python app.py`.
5. Open `http://127.0.0.1:5050`.

The app also has a local assistant fallback, so the AI button remains usable when the API is unavailable.

## v4.3 upgrade — real working features added

The v4 build looked complete on the surface but several pitched features either had no UI or were broken. This upgrade makes them actually work:

- **Reminders were fully wired up.** The backend already had a complete reminders API, but no page ever displayed it. Patients now see a "Reminders" panel on their profile page with add / mark-done / remove, backed by the existing database.
- **Fixed "What Happened First?"** — it was silently rendered as an exact duplicate of "Daily Routine Recall". It's now a distinct memory-recall game: the sequence is shown briefly, then hidden, and the person reconstructs it from memory.
- **Fixed "Odd One Out"** — the correct answer was hardcoded to one emoji regardless of which item set was shuffled in, so it could be unsolvable. It now tracks the actual odd item across several randomized sets.
- **Real multi-language UI**, not just a language picker. English, Hindi, Assamese and Bengali now have full interface translations (headers, buttons, labels) that render based on each patient's chosen language; other languages fall back cleanly to English rather than showing blanks.
- **Offline-first, for real.** A service worker caches the app shell so it still loads with no connection, and game results / reminder actions made while offline are queued in the browser and synced automatically once the connection returns — with a status banner so the caregiver/patient can see it happening.
- **Caregiver dashboard access control.** Trends, session history, and caregiver notes previously had zero access control despite being pitched as "role-based access." The caregiver dashboard now sits behind a PIN gate (`CAREGIVER_PIN` in `.env`, default `1234` for the demo — change it for any real deployment), enforced server-side on the API, not just hidden in the UI.
- Added a print button on the caregiver dashboard for a quick paper/PDF report via the browser's print dialog.

Nothing that already worked (the AI companion, adaptive difficulty, memories, analytics) was changed in this pass — only what was missing, silently broken, or unimplemented.

## v4.4 upgrade — the AI is now actually adaptive

Before this pass, "adaptive difficulty" was a headline claim only: a difficulty number was stored with every session but never read back or used for anything, and the caregiver's "AI observations" were a single overall recent-vs-older accuracy comparison with no connection to which specific game or skill was involved.

- **Difficulty now genuinely changes the games.** Each game/patient pair has its own rolling difficulty (1–5), computed from that person's own last few rounds of *that specific game* (not a population norm). It's fetched live before every round and actually reshapes what's presented: more pairs in Memory Match, longer sequences in Pattern Recall, more/faster targets in Attention & Focus, a bigger shopping list in Grocery Basket, a shorter memorization window in What Happened First. The reasoning ("recent accuracy is strong, so this round adds a little more challenge") is shown right in the game so it's not a black box.
- **Recommendations are multi-factor, not just "pick the worst score."** The engine now weighs current weakness, how long it's been since a game was last played (spaced repetition), which specific error type has been rising in that game (sequencing, focus, or spatial/positional), and avoids immediately repeating the last game played. The reason shown is grounded in real numbers pulled from that factor, not a template.
- **Caregiver observations are per-game and error-specific**, not just one global trend. Where a specific game has enough of its own history, the AI names the specific skill involved (e.g. "more moments related to staying focused when something else is happening") instead of a generic "small change noticed" — while still explicitly avoiding diagnostic language.
- **Added a real engagement streak** (consecutive days played), surfaced on the patient's home page and woven into the AI companion's replies.
- **The AI companion is now genuinely personalized, with or without an API key.** Instead of dumping raw JSON into the prompt, it builds a curated briefing (streak, live recommendation + reasoning, top observations, reminders, memories) that both the cloud model and the offline local-fallback assistant use — so even without an OpenAI key configured, asking "how am I doing" or "let's play" gets an answer grounded in that person's actual recent numbers, not a canned line.


