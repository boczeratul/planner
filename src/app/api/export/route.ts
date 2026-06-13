import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/requireUser";
import { dateForDay } from "@/lib/dates";
import { collectStays, googleMapsUrl, nightsLabel } from "@/lib/stays";
import type { LogisticsLeg, ScheduleBlock, TripPlan } from "@/lib/types";

export const maxDuration = 60;

const NOTION_API = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

const TYPE_EMOJI: Record<ScheduleBlock["type"], string> = {
  arrival: "🛬",
  departure: "🛫",
  breakfast: "🥐",
  lunch: "🍜",
  dinner: "🍽️",
  attraction: "🏛️",
  activity: "🎟️",
  rest: "☕",
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

/* Minimal rich-text builder. Notion block shapes are deep ad-hoc JSON; typing
   them fully buys nothing here, so these helpers stay `unknown`-shaped. */
function rt(text: string, opts?: { link?: string; bold?: boolean; gray?: boolean }) {
  return [
    {
      type: "text",
      text: { content: text, link: opts?.link ? { url: opts.link } : null },
      annotations: {
        bold: opts?.bold ?? false,
        color: opts?.gray ? "gray" : "default",
      },
    },
  ];
}

function bullet(richText: unknown) {
  return { type: "bulleted_list_item", bulleted_list_item: { rich_text: richText } };
}

/** Build the page's block children, mirroring the reference layout:
 *  summary → 📅 itinerary (toggleable heading per day, time-prefixed bullets,
 *  transit lines in gray) → 🏨 lodging table with Google Maps links. */
function buildBlocks(plan: TripPlan): unknown[] {
  const blocks: unknown[] = [];

  blocks.push({ type: "paragraph", paragraph: { rich_text: rt(plan.summary) } });
  blocks.push({ type: "divider", divider: {} });
  blocks.push({ type: "heading_2", heading_2: { rich_text: rt("📅 Itinerary") } });

  for (const day of plan.days) {
    const date = dateForDay(plan.startDate, day.day);
    const heading = `🗓️ Day ${day.day}${date ? `（${date}）` : ""}｜${day.theme}`;
    const legByPair = new Map(day.legs.map((l) => [`${l.fromBlockId}->${l.toBlockId}`, l]));

    const children: unknown[] = [];
    day.blocks.forEach((b, i) => {
      children.push(
        bullet(rt(`${b.startTime}　${TYPE_EMOJI[b.type]} ${b.title} · ${b.location}`)),
      );
      const next = day.blocks[i + 1];
      const leg = next ? legByPair.get(`${b.id}->${next.id}`) : undefined;
      if (leg) {
        children.push(
          bullet(
            rt(`→ ${MODE_EMOJI[leg.mode]} ${leg.summary} · ${leg.durationMinutes} min`, {
              gray: true,
            }),
          ),
        );
      }
    });

    blocks.push({
      type: "heading_3",
      heading_3: { rich_text: rt(heading), is_toggleable: true, children },
    });
  }

  const stays = collectStays(plan);
  if (stays.length > 0) {
    blocks.push({ type: "divider", divider: {} });
    blocks.push({ type: "heading_2", heading_2: { rich_text: rt("🏨 Lodging") } });

    const headerRow = {
      type: "table_row",
      table_row: {
        cells: [rt("Dates", { bold: true }), rt("Area", { bold: true }), rt("Hotel", { bold: true }), rt("Map", { bold: true })],
      },
    };
    const rows = stays.map((stay) => {
      const first = dateForDay(plan.startDate, stay.nights[0]);
      const last = dateForDay(plan.startDate, stay.nights[stay.nights.length - 1] + 1);
      const dates = first && last ? `${first} – ${last}` : nightsLabel(stay.nights);
      return {
        type: "table_row",
        table_row: {
          cells: [
            rt(dates),
            rt(stay.area),
            rt(stay.name),
            rt("Google Maps", { link: googleMapsUrl(stay.name, stay.area, plan.destination) }),
          ],
        },
      };
    });

    blocks.push({
      type: "table",
      table: {
        table_width: 4,
        has_column_header: true,
        has_row_header: false,
        children: [headerRow, ...rows],
      },
    });
  }

  return blocks;
}

async function notion(path: string, init: RequestInit & { body?: string }) {
  const res = await fetch(`${NOTION_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${process.env.NOTION_API_KEY}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Notion API ${res.status}: ${data.message ?? "unknown error"}`);
  }
  return data;
}

export async function POST(req: Request) {
  if (!(await getAuthUserId())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { plan } = (await req.json()) as { plan: TripPlan };
  if (!plan?.destination || !Array.isArray(plan.days)) {
    return NextResponse.json({ error: "Missing plan" }, { status: 400 });
  }
  if (!process.env.NOTION_API_KEY || !process.env.NOTION_PARENT_PAGE_ID) {
    return NextResponse.json(
      {
        error:
          "Notion export is not configured. Set NOTION_API_KEY and NOTION_PARENT_PAGE_ID in .env.local (see .env.example).",
      },
      { status: 501 },
    );
  }

  try {
    const blocks = buildBlocks(plan);

    // Page create accepts at most 100 top-level children; append the rest in
    // batches. (Rarely needed — a 7-day trip is ~15 top-level blocks.)
    const first = blocks.slice(0, 100);
    const rest = blocks.slice(100);

    const page = await notion("/pages", {
      method: "POST",
      body: JSON.stringify({
        parent: { page_id: process.env.NOTION_PARENT_PAGE_ID },
        icon: { type: "emoji", emoji: "✈️" },
        properties: { title: { title: rt(`Trip to ${plan.destination}`) } },
        children: first,
      }),
    });

    for (let i = 0; i < rest.length; i += 100) {
      await notion(`/blocks/${page.id}/children`, {
        method: "PATCH",
        body: JSON.stringify({ children: rest.slice(i, i + 100) }),
      });
    }

    return NextResponse.json({ url: page.url as string });
  } catch (err) {
    console.error("export route failed:", err);
    const message = err instanceof Error ? err.message : "Export failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
