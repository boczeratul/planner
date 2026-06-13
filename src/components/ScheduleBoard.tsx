"use client";

import { useState } from "react";
import Link from "next/link";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { usePreferences } from "@/store/preferences";
import { useTrip } from "@/store/trip";
import { dateForDay } from "@/lib/dates";
import { isLocked } from "@/lib/blocks";
import type {
  DayPlan,
  LogisticsLeg,
  LogisticsUpdate,
  PartialDayPlan,
  ScheduleBlock,
} from "@/lib/types";

const TYPE_STYLES: Record<ScheduleBlock["type"], { emoji: string; badge: string }> = {
  arrival: { emoji: "🛬", badge: "bg-indigo-100 text-indigo-800" },
  departure: { emoji: "🛫", badge: "bg-indigo-100 text-indigo-800" },
  breakfast: { emoji: "🥐", badge: "bg-amber-100 text-amber-800" },
  lunch: { emoji: "🍜", badge: "bg-amber-100 text-amber-800" },
  dinner: { emoji: "🍽️", badge: "bg-rose-100 text-rose-800" },
  attraction: { emoji: "🏛️", badge: "bg-sky-100 text-sky-800" },
  activity: { emoji: "🎟️", badge: "bg-emerald-100 text-emerald-800" },
  rest: { emoji: "☕", badge: "bg-zinc-100 text-zinc-700" },
};

const MODE_EMOJI: Record<LogisticsLeg["mode"], string> = {
  walk: "🚶",
  bus: "🚌",
  train: "🚆",
  subway: "🚇",
  tram: "🚊",
  taxi: "🚕",
  ferry: "⛴️",
  flight: "✈️",
};

export function BlockInner({
  block,
  stale,
  locked = false,
}: {
  block: ScheduleBlock;
  stale: boolean;
  locked?: boolean;
}) {
  const t = TYPE_STYLES[block.type];
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span>{t.emoji}</span>
          <span className="truncate font-semibold text-zinc-900">{block.title}</span>
        </div>
        <p className="mt-1 line-clamp-2 text-sm text-zinc-600">{block.description}</p>
        <p className="mt-1 text-xs text-zinc-400">📍 {block.location}</p>
      </div>
      <div className="shrink-0 text-right">
        <span className={`font-mono text-sm font-semibold ${stale ? "text-zinc-300" : "text-zinc-800"}`}>
          {stale ? "--:--" : block.startTime}
        </span>
        <span className={`mt-1 block rounded-full px-2 py-0.5 text-[10px] font-medium ${t.badge}`}>
          {locked && "📌 "}
          {block.type}
        </span>
      </div>
    </div>
  );
}

export { isLocked };

function SortableBlock({
  block,
  stale,
  dayNumber,
}: {
  block: ScheduleBlock;
  stale: boolean;
  dayNumber: number;
}) {
  const locked = isLocked(block);
  const setChatDraft = useTrip((s) => s.setChatDraft);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: block.id, disabled: locked });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      title={locked ? "This block is fixed and can't be moved" : undefined}
      className={`group relative rounded-xl border bg-white p-4 shadow-sm transition ${
        locked ? "cursor-default" : "cursor-grab active:cursor-grabbing"
      } ${isDragging ? "z-10 border-indigo-400 shadow-lg" : "border-zinc-200"}`}
    >
      <BlockInner block={block} stale={stale} locked={locked} />
      {!locked && (
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            setChatDraft(
              `Replace "${block.title}" on day ${dayNumber}. Why / what I'd prefer instead: `,
            );
          }}
          title="Swap this out — tell the planner what you'd prefer"
          className="absolute bottom-2 right-2 hidden rounded-md border border-zinc-200 bg-white px-1.5 py-0.5 text-xs font-medium text-zinc-500 shadow-sm transition hover:border-indigo-400 hover:text-indigo-600 group-hover:block"
        >
          ⇄ swap
        </button>
      )}
    </div>
  );
}

export function TransitLeg({ leg }: { leg: LogisticsLeg }) {
  return (
    <div className="ml-5 flex items-center gap-2 border-l-2 border-dashed border-zinc-300 py-1.5 pl-4 text-xs text-zinc-500">
      <span>{MODE_EMOJI[leg.mode]}</span>
      <span>{leg.summary}</span>
      <span className="text-zinc-400">· {leg.durationMinutes} min</span>
    </div>
  );
}

function DayColumn({
  day,
  destination,
  startDate,
}: {
  day: DayPlan;
  destination: string;
  startDate?: string;
}) {
  const answers = usePreferences((s) => s.answers);
  const microPreferences = usePreferences((s) => s.microPreferences);
  const addMicroPreferences = usePreferences((s) => s.addMicroPreferences);
  const {
    reorderDay,
    startRecompute,
    applyLogistics,
    finishRecompute,
    recomputingDays,
    setPlanError,
    addMessage,
  } = useTrip();
  const recomputing = recomputingDays.includes(day.day);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Legs only render when they still match consecutive block pairs; after a
  // reorder they go stale and disappear until the recompute lands.
  const legByPair = new Map(day.legs.map((l) => [`${l.fromBlockId}->${l.toBlockId}`, l]));

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const ids = day.blocks.map((b) => b.id);
    const byId = new Map(day.blocks.map((b) => [b.id, b]));
    let newIds = arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id)));
    // Arrival/departure anchor the day's edges — even when another block is
    // dropped past them, they snap back to first/last.
    const isArrival = (id: string) => byId.get(id)?.type === "arrival";
    const isDeparture = (id: string) => byId.get(id)?.type === "departure";
    newIds = [
      ...newIds.filter(isArrival),
      ...newIds.filter((id) => !isArrival(id) && !isDeparture(id)),
      ...newIds.filter(isDeparture),
    ];
    if (newIds.every((id, i) => id === ids[i])) return; // no effective change
    reorderDay(day.day, newIds);

    const newBlocks = newIds.map((id) => byId.get(id)!);

    startRecompute(day.day);
    try {
      const res = await fetch("/api/logistics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          destination,
          day: day.day,
          blocks: newBlocks,
          previousBlockIds: ids,
          preferences: answers,
          learned: microPreferences.map((m) => m.text),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Logistics failed (${res.status})`);
      const update = data as LogisticsUpdate;
      applyLogistics(day.day, update);
      for (const t of addMicroPreferences(update.learnedPreferences ?? [], "drag")) {
        addMessage({ role: "note", text: `📌 Noted: ${t}` });
      }
    } catch (err) {
      setPlanError(err instanceof Error ? err.message : "Logistics recompute failed");
    } finally {
      finishRecompute(day.day);
    }
  }

  const dateLabel = dateForDay(startDate, day.day);

  return (
    <div className="w-80 shrink-0 rounded-2xl bg-zinc-50 p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="font-bold text-zinc-900">
          Day {day.day}
          {dateLabel && <span className="ml-2 text-sm font-medium text-zinc-400">{dateLabel}</span>}
        </h3>
        {recomputing && (
          <span className="animate-pulse text-xs font-medium text-indigo-600">
            sorting logistics…
          </span>
        )}
      </div>
      <p className="mb-4 text-sm text-zinc-500">{day.theme}</p>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={day.blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col">
            {day.blocks.map((block, i) => {
              const next = day.blocks[i + 1];
              const leg = next ? legByPair.get(`${block.id}->${next.id}`) : undefined;
              return (
                <div key={block.id}>
                  <SortableBlock block={block} stale={recomputing} dayNumber={day.day} />
                  {next && (leg && !recomputing ? <TransitLeg leg={leg} /> : <div className="h-3" />)}
                </div>
              );
            })}
          </div>
        </SortableContext>
      </DndContext>

      {day.lodging && (
        <div className="mt-4 rounded-xl border border-zinc-200 bg-white p-3 text-sm">
          <p className="font-medium text-zinc-800">🛏️ {day.lodging.name}</p>
          <p className="text-xs text-zinc-500">
            {day.lodging.area} — {day.lodging.reason}
          </p>
        </div>
      )}
    </div>
  );
}

/** Read-only column rendered while the plan is still streaming in. */
function StreamingDayColumn({
  day,
  active,
  startDate,
}: {
  day: PartialDayPlan;
  /** this day is the one currently being written by the model */
  active: boolean;
  startDate?: string;
}) {
  const legByPair = new Map(day.legs.map((l) => [`${l.fromBlockId}->${l.toBlockId}`, l]));
  const dateLabel = dateForDay(startDate, day.day);
  return (
    <div className="w-80 shrink-0 rounded-2xl bg-zinc-50 p-4">
      <h3 className="mb-3 font-bold text-zinc-900">
        Day {day.day}
        {dateLabel && <span className="ml-2 text-sm font-medium text-zinc-400">{dateLabel}</span>}
      </h3>
      {day.theme && <p className="mb-4 text-sm text-zinc-500">{day.theme}</p>}
      <div className="flex flex-col">
        {day.blocks.map((block, i) => {
          const next = day.blocks[i + 1];
          const leg = next ? legByPair.get(`${block.id}->${next.id}`) : undefined;
          return (
            <div key={block.id}>
              <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
                <BlockInner block={block} stale={false} />
              </div>
              {next && (leg ? <TransitLeg leg={leg} /> : <div className="h-3" />)}
            </div>
          );
        })}
        {active && (
          <div className="mt-3 animate-pulse rounded-xl border border-dashed border-indigo-300 bg-indigo-50/50 p-4 text-center text-sm text-indigo-500">
            ✍️ planning…
          </div>
        )}
      </div>
      {day.lodging && (
        <div className="mt-4 rounded-xl border border-zinc-200 bg-white p-3 text-sm">
          <p className="font-medium text-zinc-800">🛏️ {day.lodging.name}</p>
          <p className="text-xs text-zinc-500">
            {day.lodging.area} — {day.lodging.reason}
          </p>
        </div>
      )}
    </div>
  );
}

export function ScheduleBoard() {
  const plan = useTrip((s) => s.plan);
  const streaming = useTrip((s) => s.streaming);
  const streamingPlan = useTrip((s) => s.streamingPlan);
  const reset = useTrip((s) => s.reset);
  const setStartDate = useTrip((s) => s.setStartDate);
  const addMessage = useTrip((s) => s.addMessage);
  const setPlanError = useTrip((s) => s.setPlanError);
  const [pendingDate, setPendingDate] = useState("");
  const [exporting, setExporting] = useState(false);

  async function exportToNotion() {
    if (!plan || exporting) return;
    setExporting(true);
    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Export failed (${res.status})`);
      window.open(data.url, "_blank", "noopener,noreferrer");
      addMessage({
        role: "note",
        text: `📄 Exported to Notion: ${data.url} — anyone with access to the parent page can see it; publish the parent page once to make exports publicly sharable.`,
      });
    } catch (err) {
      setPlanError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  if (streaming) {
    return (
      <div className="px-6 pb-16 pt-8">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-zinc-900">
            {streamingPlan?.destination ?? (
              <span className="animate-pulse text-zinc-400">Planning your trip…</span>
            )}
            {streamingPlan?.durationDays ? ` · ${streamingPlan.durationDays} days` : ""}
          </h2>
          {streamingPlan?.summary && <p className="mt-2 text-zinc-600">{streamingPlan.summary}</p>}
          <p className="mt-1 text-xs text-indigo-500">
            Building your itinerary live — dragging unlocks when it&apos;s finished.
          </p>
        </div>
        <div className="flex gap-5 overflow-x-auto pb-4">
          {(streamingPlan?.days ?? []).map((day, i, arr) => (
            <StreamingDayColumn
              key={day.day}
              day={day}
              active={day.day === (streamingPlan?.activeDay ?? arr[arr.length - 1]?.day)}
              startDate={streamingPlan?.startDate}
            />
          ))}
          {(streamingPlan?.days ?? []).length === 0 && (
            <div className="w-80 shrink-0 animate-pulse rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 p-8 text-center text-sm text-zinc-400">
              Sketching day 1…
            </div>
          )}
        </div>
      </div>
    );
  }

  if (!plan) return null;

  return (
    <div className="px-6 pb-16 pt-8">
      <div className="mb-6">
        <div className="flex items-baseline justify-between">
          <h2 className="text-2xl font-bold text-zinc-900">
            {plan.destination} · {plan.durationDays} days
          </h2>
          <div className="flex items-center gap-4">
            <Link
              href="/execute"
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-indigo-500"
            >
              Execute itinerary ▶
            </Link>
            <button
              onClick={exportToNotion}
              disabled={exporting}
              className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-50"
            >
              {exporting ? "Exporting…" : "Export to Notion ↗"}
            </button>
            <button
              onClick={reset}
              className="text-sm font-medium text-zinc-400 hover:text-zinc-700"
            >
              Start over
            </button>
          </div>
        </div>
        <p className="mt-2 text-zinc-600">{plan.summary}</p>
        <p className="mt-1 text-xs text-zinc-400">
          Drag blocks to rearrange a day — transit and timings recompute automatically. Or ask
          for changes in the chat on the left.
        </p>
        {!plan.startDate && (
          <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
            <span>📅 When does your trip start? Dates will appear on each day.</span>
            <input
              type="date"
              value={pendingDate}
              onChange={(e) => setPendingDate(e.target.value)}
              className="rounded-lg border border-amber-300 bg-white px-2 py-1 text-sm text-zinc-800"
            />
            <button
              onClick={() => pendingDate && setStartDate(pendingDate)}
              disabled={!pendingDate}
              className="rounded-lg bg-amber-600 px-3 py-1 font-medium text-white transition hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Set
            </button>
          </div>
        )}
      </div>

      <div className="flex gap-5 overflow-x-auto pb-4">
        {plan.days.map((day) => (
          <DayColumn
            key={day.day}
            day={day}
            destination={plan.destination}
            startDate={plan.startDate}
          />
        ))}
      </div>
    </div>
  );
}
