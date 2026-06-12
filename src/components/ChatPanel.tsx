"use client";

import { useEffect, useRef, useState } from "react";
import { usePreferences } from "@/store/preferences";
import { useTrip } from "@/store/trip";
import type { PlanResponse } from "@/lib/types";

export function ChatPanel() {
  const [text, setText] = useState("");
  const answers = usePreferences((s) => s.answers);
  const resetOnboarding = usePreferences((s) => s.resetOnboarding);
  const {
    plan,
    planning,
    planError,
    messages,
    setPlanning,
    setPlan,
    setPlanError,
    addMessage,
  } = useTrip();

  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, planning]);

  async function submit() {
    const request = text.trim();
    if (!request || planning) return;
    setText("");
    addMessage({ role: "user", text: request });
    setPlanning(true);
    setPlanError(null);
    try {
      const res = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          request,
          preferences: answers,
          currentPlan: plan,
          history: messages,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Planning failed (${res.status})`);
      const { reply, plan: newPlan } = data as PlanResponse;
      setPlan(newPlan);
      addMessage({ role: "assistant", text: reply });
    } catch (err) {
      setPlanError(err instanceof Error ? err.message : "Planning failed");
    } finally {
      setPlanning(false);
    }
  }

  return (
    <aside className="flex h-full w-[380px] shrink-0 flex-col border-r border-zinc-200 bg-zinc-50">
      <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
        <h1 className="font-bold text-zinc-900">Trip planner</h1>
        <button
          onClick={resetOnboarding}
          className="text-xs font-medium text-zinc-400 hover:text-zinc-700"
          title="Redo the preference quiz"
        >
          Retake quiz
        </button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <div className="rounded-xl bg-white p-4 text-sm text-zinc-600 shadow-sm">
            <p className="font-medium text-zinc-800">Describe your trip</p>
            <p className="mt-1">
              Destination, how long, anything special — e.g.{" "}
              <span className="italic">
                &ldquo;4 days in Kyoto in November, I love food and quiet temples&rdquo;
              </span>
            </p>
            <p className="mt-2 text-xs text-zinc-400">
              Once the plan appears, keep chatting here to refine it — &ldquo;make day 2 more
              relaxed&rdquo;, &ldquo;swap the museum for a hike&rdquo;…
            </p>
          </div>
        )}

        {messages.map((m, i) => (
          <div
            key={i}
            className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap ${
              m.role === "user"
                ? "ml-auto bg-indigo-600 text-white"
                : "mr-auto bg-white text-zinc-800 shadow-sm"
            }`}
          >
            {m.text}
          </div>
        ))}

        {planning && (
          <div className="mr-auto max-w-[85%] animate-pulse rounded-2xl bg-white px-4 py-2.5 text-sm text-indigo-600 shadow-sm">
            {plan ? "Reworking the plan…" : "Designing your itinerary — this can take a minute…"}
          </div>
        )}
        {planError && (
          <div className="mr-auto max-w-[85%] rounded-2xl bg-red-50 px-4 py-2.5 text-sm text-red-700">
            {planError}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-zinc-200 bg-white p-3">
        <div className="flex items-end gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            rows={2}
            placeholder={plan ? "Refine the plan…" : "Describe your trip…"}
            className="flex-1 resize-none rounded-xl border-2 border-zinc-200 bg-white p-3 text-sm text-zinc-900 outline-none transition focus:border-indigo-400"
          />
          <button
            onClick={submit}
            disabled={planning || !text.trim()}
            className="rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Send
          </button>
        </div>
        <p className="mt-1.5 text-[10px] text-zinc-400">Enter to send · Shift+Enter for a new line</p>
      </div>
    </aside>
  );
}
