"use client";

import { useState } from "react";
import { PREFERENCE_QUESTIONS } from "@/lib/preferences";
import { usePreferences } from "@/store/preferences";

export function Onboarding() {
  const [step, setStep] = useState(0);
  const { answers, setAnswer, completeOnboarding } = usePreferences();

  const question = PREFERENCE_QUESTIONS[step];
  const total = PREFERENCE_QUESTIONS.length;
  const isLast = step === total - 1;

  function choose(optionId: string) {
    setAnswer(question.id, optionId);
    if (isLast) {
      completeOnboarding();
    } else {
      setStep(step + 1);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <p className="mb-2 text-sm font-medium text-zinc-500">
        Question {step + 1} of {total}
      </p>
      <div className="mb-8 h-1.5 w-full overflow-hidden rounded-full bg-zinc-200">
        <div
          className="h-full rounded-full bg-indigo-500 transition-all"
          style={{ width: `${((step + 1) / total) * 100}%` }}
        />
      </div>

      <h2 className="mb-8 text-2xl font-semibold text-zinc-900">{question.prompt}</h2>

      <div className="grid gap-4 sm:grid-cols-2">
        {[question.optionA, question.optionB].map((opt) => (
          <button
            key={opt.id}
            onClick={() => choose(opt.id)}
            className={`rounded-2xl border-2 p-6 text-left transition hover:border-indigo-400 hover:bg-indigo-50 ${
              answers[question.id] === opt.id
                ? "border-indigo-500 bg-indigo-50"
                : "border-zinc-200 bg-white"
            }`}
          >
            <span className="block text-lg font-semibold text-zinc-900">{opt.label}</span>
            <span className="mt-2 block text-sm text-zinc-600">{opt.description}</span>
          </button>
        ))}
      </div>

      {step > 0 && (
        <button
          onClick={() => setStep(step - 1)}
          className="mt-8 text-sm font-medium text-zinc-500 hover:text-zinc-800"
        >
          ← Back
        </button>
      )}
    </div>
  );
}
