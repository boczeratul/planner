import type { PreferenceAnswers, PreferenceQuestion } from "./types";

export const PREFERENCE_QUESTIONS: PreferenceQuestion[] = [
  {
    id: "pace",
    prompt: "It's day 2 of your trip. Which morning sounds better?",
    optionA: {
      id: "packed",
      label: "Up at 7, three sights before lunch",
      description: "Maximize every hour — you can rest when you're home.",
    },
    optionB: {
      id: "relaxed",
      label: "Slow coffee, one place, no rush",
      description: "A trip is for recharging, not a checklist.",
    },
  },
  {
    id: "food",
    prompt: "Dinner time. Where are you heading?",
    optionA: {
      id: "street",
      label: "Night market stalls",
      description: "Plastic stools, local crowds, the dish everyone queues for.",
    },
    optionB: {
      id: "restaurant",
      label: "A booked table",
      description: "A well-reviewed restaurant with a tasting menu.",
    },
  },
  {
    id: "interests",
    prompt: "A free afternoon appears. You spend it…",
    optionA: {
      id: "culture",
      label: "Museums & old streets",
      description: "History, architecture, galleries, temples.",
    },
    optionB: {
      id: "nature",
      label: "Hike or waterfront",
      description: "Parks, viewpoints, beaches, a walk out of town.",
    },
  },
  {
    id: "structure",
    prompt: "How do you feel about a fully scheduled day?",
    optionA: {
      id: "planned",
      label: "Love it",
      description: "Tickets booked ahead, timings sorted, no decisions on the day.",
    },
    optionB: {
      id: "spontaneous",
      label: "Leave gaps",
      description: "A loose anchor or two, and room to wander.",
    },
  },
  {
    id: "budget",
    prompt: "Two hotels, same neighborhood. You pick…",
    optionA: {
      id: "value",
      label: "Clean & cheap",
      description: "It's just a bed — spend the savings on experiences.",
    },
    optionB: {
      id: "comfort",
      label: "The nicer one",
      description: "A great room and breakfast set up the whole day.",
    },
  },
  {
    id: "transport",
    prompt: "Getting across town, you'd rather…",
    optionA: {
      id: "transit",
      label: "Public transit & walking",
      description: "Cheaper, and you see the city on the way.",
    },
    optionB: {
      id: "taxi",
      label: "Taxi / rideshare",
      description: "Door to door, no figuring out ticket machines.",
    },
  },
  {
    id: "rhythm",
    prompt: "Your natural travel rhythm is…",
    optionA: {
      id: "early",
      label: "Early bird",
      description: "Beat the crowds, done by dinner.",
    },
    optionB: {
      id: "night",
      label: "Night owl",
      description: "Slow mornings, alive after dark.",
    },
  },
];

/** Render the stored answers as a plain-language profile for the planner prompt. */
export function describePreferences(answers: PreferenceAnswers): string {
  const lines = PREFERENCE_QUESTIONS.filter((q) => answers[q.id]).map((q) => {
    const picked = answers[q.id] === q.optionA.id ? q.optionA : q.optionB;
    return `- ${q.prompt} -> ${picked.label} (${picked.description})`;
  });
  if (lines.length === 0) return "No stated preferences; assume a balanced traveler.";
  return lines.join("\n");
}
