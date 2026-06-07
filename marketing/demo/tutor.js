window.RECALLIT_TUTOR = {
  "question": "Explain why the recallit engine stays topic-agnostic — what architectural choices enforce this?",
  "pack": "architecture",
  "note": "Recorded: the examiner's real per-checkpoint judgment, re-verified and counted by code. The model proposes evidence; code decides the rating.",
  "answers": [
    {
      "label": "A strong answer",
      "text": "Subject-specific content (cards, scenarios, dialect config) lives entirely in data/ and topic.json, never in src/. The load-bearing rule assigns invariants to code and subject knowledge to prompts+data. No branches in src/ reference a specific subject. This is proven by the World Capitals test running with zero code change.",
      "rating": "Good",
      "receipt": "coverage vs rubric: 3/3 required, 0/1 bonus -> Good",
      "checkpoints": [
        {
          "claim": "Subject-specific content lives in data/ config and prompts, not in src/ code",
          "required": true,
          "hit": true,
          "evidence": "Subject-specific content (cards, scenarios, dialect config) lives entirely in data/ and topic.json, never in src/.",
          "sourceQuote": "anything Spanish-specific is either data (`topic.json`, cards) or prose the agent reads (scenarios, prompts), never a branch in `src/`."
        },
        {
          "claim": "The load-bearing rule: code owns invariants/sequencing; prompts+data own subject and pedagogy",
          "required": true,
          "hit": true,
          "evidence": "The load-bearing rule assigns invariants to code and subject knowledge to prompts+data.",
          "sourceQuote": "code owns invariants and sequencing; prompts + data own the subject and the pedagogy."
        },
        {
          "claim": "Proven by running a World Capitals deck in tests with zero code change",
          "required": true,
          "hit": true,
          "evidence": "This is proven by the World Capitals test running with zero code change.",
          "sourceQuote": "The same engine, agent, turn loop, and grader run a non-language deck (World Capitals) in the test suite with **zero code change** — only a different `topic.json` + cards."
        },
        {
          "claim": "Packs extend agnosticism to distribution — subjects ship and version independently of the engine",
          "required": false,
          "hit": false,
          "evidence": "",
          "sourceQuote": "This is the agnostic principle extended to distribution: subjects ship and version independently of the engine."
        }
      ]
    },
    {
      "label": "A vague answer",
      "text": "It's pretty flexible and works with lots of different subjects, so you can use it for whatever you want to learn.",
      "rating": "Again",
      "receipt": "coverage vs rubric: 0/3 required, 0/1 bonus -> Again",
      "checkpoints": [
        {
          "claim": "Subject-specific content lives in data/ config and prompts, not in src/ code",
          "required": true,
          "hit": false,
          "evidence": "",
          "sourceQuote": "anything Spanish-specific is either data (`topic.json`, cards) or prose the agent reads (scenarios, prompts), never a branch in `src/`."
        },
        {
          "claim": "The load-bearing rule: code owns invariants/sequencing; prompts+data own subject and pedagogy",
          "required": true,
          "hit": false,
          "evidence": "",
          "sourceQuote": "code owns invariants and sequencing; prompts + data own the subject and the pedagogy."
        },
        {
          "claim": "Proven by running a World Capitals deck in tests with zero code change",
          "required": true,
          "hit": false,
          "evidence": "",
          "sourceQuote": "The same engine, agent, turn loop, and grader run a non-language deck (World Capitals) in the test suite with **zero code change** — only a different `topic.json` + cards."
        },
        {
          "claim": "Packs extend agnosticism to distribution — subjects ship and version independently of the engine",
          "required": false,
          "hit": false,
          "evidence": "",
          "sourceQuote": "This is the agnostic principle extended to distribution: subjects ship and version independently of the engine."
        }
      ]
    }
  ]
};
