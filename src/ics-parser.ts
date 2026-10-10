import { readFileSync } from "node:fs";
import ical, { type VEvent, type ParameterValue } from "node-ical";
import type { CalendarEvent } from "./types.js";

/**
 * ICS ファイルをパースして CalendarEvent 配列を返す
 */
export function parseIcsFile(filePath: string): CalendarEvent[] {
  const content = readFileSync(filePath, "utf-8");
  const parsed = ical.sync.parseICS(content);
  const events: CalendarEvent[] = [];

  for (const component of Object.values(parsed)) {
    if (!component || component.type !== "VEVENT") continue;

    const vevent = component as VEvent;
    if (!vevent.end) continue;

    const allDay = vevent.datetype === "date";

    events.push({
      uid: vevent.uid,
      summary: parameterValueToString(vevent.summary),
      description: parameterValueToString(vevent.description),
      location: parameterValueToString(vevent.location),
      categories: extractCategories(vevent),
      start: new Date(vevent.start),
      end: new Date(vevent.end),
      allDay,
      recurrence: extractRecurrence(vevent),
      lastModified: vevent.lastmodified ? new Date(vevent.lastmodified) : null,
    });
  }

  return events;
}

/** ParameterValue<string> を plain string に変換 */
function parameterValueToString(value: ParameterValue | undefined): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  return value.val;
}

function extractRecurrence(vevent: VEvent): string[] {
  const rules: string[] = [];

  if (vevent.rrule) {
    const rruleStr = vevent.rrule.toString();
    if (rruleStr) {
      rules.push(
        rruleStr.startsWith("RRULE:") ? rruleStr : `RRULE:${rruleStr}`
      );
    }
  }

  return rules;
}


/** ICS の CATEGORIES からラベル・カテゴリー名を取得 */
function extractCategories(vevent: VEvent): string[] {
  const raw: unknown = (vevent as unknown as Record<string, unknown>)
    .categories;

  if (raw == null) return [];

  const values: unknown[] = Array.isArray(raw) ? raw : [raw];

  return values
    .flatMap((value): string[] => {
      let text = "";

      if (typeof value === "string") {
        text = value;
      } else if (
        typeof value === "object" &&
        value !== null &&
        "val" in value
      ) {
        const val: unknown = value.val;
        if (typeof val === "string") {
          text = val;
        }
      }

      return text ? text.split(/(?<!\\),/) : [];
    })
    .map((value) => value.replace(/\\,/g, ",").trim())
    .filter(Boolean);
}
