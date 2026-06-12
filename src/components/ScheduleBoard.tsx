"use client";

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
import type {
  DayPlan,
  LogisticsLeg,
  LogisticsUpdate,
  PartialDayPlan,
  ScheduleBlock,
} from "@/lib/types";

const TYPE_STYLES: Record<ScheduleBlock["type"], { emoji: string; badge: string }> = {
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

function BlockInner({ block, stale }: { block: ScheduleBlock; stale: boolean }) {
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
          {block.type}
        </span>
      </div>
    </div>
  );
}

function SortableBlock({ block, stale }: { block: ScheduleBlock; stale: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: block.id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`cursor-grab rounded-xl border bg-white p-4 shadow-sm transition active:cursor-grabbing ${
        isDragging ? "z-10 border-indigo-400 shadow-lg" : "border-zinc-200"
      }`}
    >
      <BlockInner block={block} stale={stale} />
    </div>
  );
}

function TransitLeg({ leg }: { leg: LogisticsLeg }) {
  return (
    <div className="ml-5 flex items-center gap-2 border-l-2 border-dashed border-zinc-300 py-1.5 pl-4 text-xs text-zinc-500">
      <span>{MODE_EMOJI[leg.mode]}</span>
      <span>{leg.summary}</span>
      <span className="text-zinc-400">· {leg.durationMinutes} min</span>
    </div>
  );
}

function DayColumn({ day, destination }: { day: DayPlan; destination: string }) {
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
    const newIds = arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id)));
    reorderDay(day.day, newIds);

    const byId = new Map(day.blocks.map((b) => [b.id, b]));
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

  return (
    <div className="w-80 shrink-0 rounded-2xl bg-zinc-50 p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="font-bold text-zinc-900">Day {day.day}</h3>
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
                  <SortableBlock block={block} stale={recomputing} />
                  {next && (leg && !recomputing ? <TransitLeg leg={leg} /> : <div className="h-3" />)}
                </div>
              );
            })}
          </div>
        </SortableContext>
      </DndContext>

      <div className="mt-4 rounded-xl border border-zinc-200 bg-white p-3 text-sm">
        <p className="font-medium text-zinc-800">🛏️ {day.lodging.name}</p>
        <p className="text-xs text-zinc-500">
          {day.lodging.area} — {day.lodging.reason}
        </p>
      </div>
    </div>
  );
}

/** Read-only column rendered while the plan is still streaming in. */
function StreamingDayColumn({ day, isLast }: { day: PartialDayPlan; isLast: boolean }) {
  const legByPair = new Map(day.legs.map((l) => [`${l.fromBlockId}->${l.toBlockId}`, l]));
  return (
    <div className="w-80 shrink-0 rounded-2xl bg-zinc-50 p-4">
      <h3 className="mb-3 font-bold text-zinc-900">Day {day.day}</h3>
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
        {isLast && (
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
            <StreamingDayColumn key={day.day} day={day} isLast={i === arr.length - 1} />
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
          <button
            onClick={reset}
            className="text-sm font-medium text-zinc-400 hover:text-zinc-700"
          >
            Start over
          </button>
        </div>
        <p className="mt-2 text-zinc-600">{plan.summary}</p>
        <p className="mt-1 text-xs text-zinc-400">
          Drag blocks to rearrange a day — transit and timings recompute automatically. Or ask
          for changes in the chat on the left.
        </p>
      </div>

      <div className="flex gap-5 overflow-x-auto pb-4">
        {plan.days.map((day) => (
          <DayColumn key={day.day} day={day} destination={plan.destination} />
        ))}
      </div>
    </div>
  );
}
