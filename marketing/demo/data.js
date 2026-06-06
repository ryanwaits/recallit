window.RECALLIT_DEMO = {
  "pack": {
    "id": "spanish-mx-rgv",
    "name": "Conversational Mexican Spanish (RGV)"
  },
  "engine": "Grades and intervals computed offline by recallit's own grader (evaluateAnswer) and FSRS-6 scheduler (previewSchedule), fuzz disabled for reproducibility.",
  "cards": [
    {
      "front": "Tengo hambre.",
      "back": "I'm hungry.",
      "audio": "audio/00-tengo-hambre.mp3",
      "sample": {
        "typed": "Tengo hambre.",
        "rating": "Easy",
        "score": 1,
        "reasons": [
          "exact match"
        ],
        "nextDays": 77
      },
      "schedule": {
        "Again": 0,
        "Hard": 32,
        "Good": 46,
        "Easy": 77
      }
    },
    {
      "front": "¿Qué onda?",
      "back": "What's up? / How's it going?",
      "audio": "audio/31-que-onda.mp3",
      "sample": {
        "typed": "que onda",
        "rating": "Good",
        "score": 0.95,
        "reasons": [
          "matches after normalization"
        ],
        "nextDays": 46
      },
      "schedule": {
        "Again": 0,
        "Hard": 32,
        "Good": 46,
        "Easy": 77
      }
    },
    {
      "front": "Ándale pues.",
      "back": "Okay then. / Go ahead.",
      "audio": "audio/37-andale-pues.mp3",
      "sample": {
        "typed": "andale pues",
        "rating": "Good",
        "score": 0.95,
        "reasons": [
          "matches after normalization"
        ],
        "nextDays": 46
      },
      "schedule": {
        "Again": 0,
        "Hard": 32,
        "Good": 46,
        "Easy": 77
      }
    },
    {
      "front": "¿Ya comiste?",
      "back": "Have you eaten yet?",
      "audio": "audio/04-ya-comiste.mp3",
      "sample": {
        "typed": "ya comites",
        "rating": "Hard",
        "score": 0.8,
        "reasons": [
          "similarity 0.80 vs \"¿Ya comiste?\"",
          "near miss"
        ],
        "nextDays": 32
      },
      "schedule": {
        "Again": 0,
        "Hard": 32,
        "Good": 46,
        "Easy": 77
      }
    },
    {
      "front": "Estoy cansado.",
      "back": "I'm tired. (male speaker)",
      "audio": "audio/27-estoy-cansado.mp3",
      "sample": {
        "typed": "I'm tired",
        "rating": "Again",
        "score": 0.15384615384615385,
        "reasons": [
          "similarity 0.15 vs \"Estoy cansado.\"",
          "below threshold"
        ],
        "nextDays": 0
      },
      "schedule": {
        "Again": 0,
        "Hard": 32,
        "Good": 46,
        "Easy": 77
      }
    },
    {
      "front": "la troca",
      "back": "the truck (regional)",
      "context": "Vamos en la troca.",
      "audio": "audio/06-la-troca.mp3",
      "sample": {
        "typed": "la troca",
        "rating": "Easy",
        "score": 1,
        "reasons": [
          "exact match"
        ],
        "nextDays": 77
      },
      "schedule": {
        "Again": 0,
        "Hard": 32,
        "Good": 46,
        "Easy": 77
      }
    }
  ]
};
