// Fixed task projections over actual MCP responses, independent of the agent loop.
const row = (value) => value.results[0];
const stamp = (value) => `${row(value).date} ${row(value).time}`;
const convert = (call, from, time, to) => call("world_time", { from, time, places: [to] });
const meeting = (call, date) => call("meeting_slots", { people: ["New York", "London 08:00-18:00", "Berlin"], date, days: 1, minutes: 60 });
const elapsed = async (call, place, date, start, end) => {
  const a = await convert(call, place, `${date} ${start}`, "UTC");
  const b = await convert(call, place, `${date} ${end}`, "UTC");
  return String((Date.parse(`${b.utc.replace(" ", "T")}Z`) - Date.parse(`${a.utc.replace(" ", "T")}Z`)) / 60_000);
};

export const VERIFICATIONS = {
  "tokyo-ny": async (call) => row(await convert(call, "Tokyo", "2026-10-15 09:00", "New York")).time,
  "dst-gap-weeks": async (call) => row(await convert(call, "New York", "2026-03-16 10:00", "London")).time,
  "skipped-time": async (call) => (await convert(call, "New York", "2026-03-08 02:30", "UTC")).status === "skipped" ? "no" : "yes",
  "kathmandu": async (call) => row(await convert(call, "UTC", "2026-10-15 00:00", "Kathmandu")).utc_offset,
  "new-year-auckland": async (call) => stamp(await convert(call, "Los Angeles", "2026-12-31 18:00", "Auckland")),
  "uk-dst-end": async (call) => row(await convert(call, "UTC", "2026-07-01 12:00", "London")).next_change.slice(0, 10),
  "bavaria-holiday": async (call) => (await call("holidays", { where: "Munich", date: "2026-01-06" })).results.length ? "yes" : "no",
  "england-business": async (call) => (await call("business_days", { where: "England", start: "2026-12-18", add: 10 })).result,
  "us-december": async (call) => String((await call("business_days", { where: "US", start: "2026-12-01", end: "2026-12-31" })).business_days),
  "weekday": async (call) => (await call("date_info", { date: "2027-03-14" })).weekday.toLowerCase(),
  "iso-week": async (call) => String(Number((await call("date_info", { date: "2027-01-01" })).iso_week.slice(-2))),
  "month-end": async (call) => (await call("date_info", { date: "2027-01-31", add: "+1 month" })).result.date,
  "meeting": async (call) => (await meeting(call, "2026-12-22")).slots[0].utc_start.slice(11),
  "month-converted": async (call) => {
    const date = (await call("date_info", { date: "2027-01-31", add: "+1 month" })).result.date;
    return stamp(await convert(call, "New York", `${date} 09:00`, "Tokyo"));
  },
  "business-converted": async (call) => {
    const date = (await call("business_days", { where: "England", start: "2026-12-18", add: 10 })).result;
    return stamp(await convert(call, "London", `${date} 09:00`, "New York"));
  },
  "meeting-tokyo": async (call) => {
    const start = (await meeting(call, "2026-12-22")).slots[0].utc_start;
    return stamp(await convert(call, "UTC", start, "Tokyo"));
  },
  "clamp-business-zone": async (call) => {
    const date = (await call("date_info", { date: "2027-01-31", add: "+1 month" })).result.date;
    const next = (await call("business_days", { where: "England", start: date, add: 1 })).result;
    return stamp(await convert(call, "London", `${next} 17:00`, "Kathmandu"));
  },
  "holiday-return-zone": async (call) => {
    const holiday = await call("holidays", { where: "Munich", date: "2026-01-06" });
    const date = holiday.results.length ? (await call("business_days", { where: "Munich", start: "2026-01-06", add: 1 })).result : "2026-01-06";
    return stamp(await convert(call, "Munich", `${date} 09:00`, "London"));
  },
  "reporting-week": async (call) => {
    const date = row(await convert(call, "Auckland", "2027-01-01 00:30", "New York")).date;
    return (await call("date_info", { date })).iso_week;
  },
  "spring-shift": (call) => elapsed(call, "New York", "2026-03-08", "01:30", "03:30"),
  "autumn-shift": (call) => elapsed(call, "New York", "2026-11-01", "00:30", "02:30"),
  "sydney-shift": (call) => elapsed(call, "Sydney", "2026-10-04", "01:30", "03:30"),
  "meeting-report-week": async (call) => {
    const start = (await meeting(call, "2026-03-16")).slots[0].utc_start;
    const date = row(await convert(call, "UTC", start, "Tokyo")).date;
    return (await call("date_info", { date })).iso_week;
  },
  "scotland-oneoff": async (call) => (await call("holidays", { where: "Scotland", date: "2026-06-15" })).results.length ? "yes" : "no",
};
