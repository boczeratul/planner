"use client";

import { useEffect, useRef, useState } from "react";
import { usePreferences } from "@/store/preferences";
import { useTrip } from "@/store/trip";
import { sendChatMessage } from "@/lib/planActions";

export function ChatPanel() {
  const [text, setText] = useState("");
  const resetOnboarding = usePreferences((s) => s.resetOnboarding);
  const plan = useTrip((s) => s.plan);
  const attractions = useTrip((s) => s.attractions);
  const planning = useTrip((s) => s.planning);
  const planError = useTrip((s) => s.planError);
  const liveReply = useTrip((s) => s.liveReply);
  const messages = useTrip((s) => s.messages);
  const chatDraft = useTrip((s) => s.chatDraft);
  const setChatDraft = useTrip((s) => s.setChatDraft);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, planning]);

  // Swap-out flow: a block's ⇄ button drops a prefilled request here for the
  // user to finish ("…Why / what I'd prefer instead: ").
  useEffect(() => {
    if (chatDraft === null) return;
    setText(chatDraft);
    setChatDraft(null);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      }
    });
  }, [chatDraft, setChatDraft]);

  function submit() {
    const request = text.trim();
    if (!request || planning) return;
    setText("");
    void sendChatMessage(request);
  }

  const proposalStage = !plan && attractions.length > 0;
  const busyText = plan
    ? "Reworking the plan…"
    : proposalStage
      ? "Updating the suggestions…"
      : "Curating attraction ideas for your trip…";
  const placeholder = plan
    ? "Refine the plan…"
    : proposalStage
      ? "Adjust the suggestions… (or pick & build on the right)"
      : "Describe your trip…";

  return (
    <aside className="flex w-full min-h-0 flex-1 flex-col bg-zinc-50">
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
              You&apos;ll first get a list of suggested attractions to vote on; the itinerary is
              built from your picks. Keep chatting anytime to refine either.
            </p>
          </div>
        )}

        {messages.map((m, i) =>
          m.role === "note" ? (
            <p key={i} className="px-2 text-center text-xs text-zinc-400">
              {m.text}
            </p>
          ) : (
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
          ),
        )}

        {planning && (
          <div
            className={`mr-auto max-w-[85%] rounded-2xl bg-white px-4 py-2.5 text-sm shadow-sm ${
              liveReply ? "whitespace-pre-wrap text-zinc-800" : "animate-pulse text-indigo-600"
            }`}
          >
            {liveReply || busyText}
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
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            rows={2}
            placeholder={placeholder}
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
