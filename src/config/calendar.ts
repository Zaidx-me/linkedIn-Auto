import fs from "fs";
import path from "path";

export interface CalendarDay {
  day: number;
  theme: string;
  hook: string;
  week: number;
}

const CALENDAR_FILE = path.resolve(process.cwd(), "data/calendar.json");

let cachedCalendar: CalendarDay[] | null = null;

export function loadCalendar(): CalendarDay[] {
  if (cachedCalendar) return cachedCalendar;
  if (!fs.existsSync(CALENDAR_FILE)) {
    throw new Error(`Calendar file not found at ${CALENDAR_FILE}`);
  }
  const parsed: CalendarDay[] = JSON.parse(fs.readFileSync(CALENDAR_FILE, "utf-8"));
  cachedCalendar = parsed;
  return parsed;
}

export function getDay(dayIndex: number): CalendarDay {
  const calendar = loadCalendar();
  if (dayIndex < 0 || dayIndex >= calendar.length) {
    throw new Error(`Invalid day index ${dayIndex}. Valid range: 0-${calendar.length - 1}`);
  }
  return calendar[dayIndex];
}

export function getNextTheme(currentDayIndex: number): string | undefined {
  const calendar = loadCalendar();
  if (currentDayIndex + 1 < calendar.length) {
    return calendar[currentDayIndex + 1].theme;
  }
  return undefined;
}
