# recallit 🧠

**Turn any source into honest, spaced-repetition flashcards — then drill them, right in chat.**

recallit is a local, code-graded spaced-repetition engine. Give it a PDF, a URL, a code repo,
or just a concept, and your agent builds a pack of cards grounded in that source — then runs
your daily review loop, one exchange at a time, with the *engine* (not the model) deciding
whether your answer was right.

## Why it's different

- **Honesty gate.** Every flashcard's source quote must be a literal, verbatim substring of the
  material it came from. Cards that don't check out get flagged `needs-review` and are never
  silently installed — no hallucinated "facts."
- **Code-graded, not vibes-graded.** The agent asks the question and reports your answer; a
  deterministic engine (`gradeResponse`) issues the verdict. The model can propose a card, but
  it never grades one.
- **FSRS-6 scheduling.** The same spaced-repetition algorithm behind modern Anki, so review
  timing is backed by real forgetting-curve research, not a fixed interval.
- **Fully keyless.** Works end-to-end with zero API keys. `ANTHROPIC_API_KEY` (or any
  OpenAI-compatible endpoint, including a local Ollama model) is optional — it only sharpens
  grading on open-ended "explain this" cards; plain flashcards never need it.
- **CLI-native.** No browser required. Built for exactly this: an agent driving the loop
  through tool calls in a chat, which is what happens inside a container/remote OpenClaw
  install where a browser SPA usually isn't reachable.

## Try it

```
"turn this PDF into flashcards"
"make a recallit deck from this article"
"quiz me on the repo I just cloned"
```

Once installed, ask your agent to build a pack from any source, then say "drill me" (or similar)
to start the daily review loop.

## Links

- Engine: [`@waits/recallit`](https://www.npmjs.com/package/@waits/recallit) on npm
- Source: [github.com/ryanwaits/recallit](https://github.com/ryanwaits/recallit)
- License: MIT
