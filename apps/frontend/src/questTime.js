// Convert datetime-local wall-clock values in a chosen IANA zone to ISO timestamps.
// Do not use the browser's local timezone for the conversion.

const WALL_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

export function isValidTimeZone(timeZone) {
  if (!timeZone || typeof timeZone !== "string") return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function pad(n) {
  return String(n).padStart(2, "0");
}

function formatWallInZone(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const map = Object.fromEntries(parts.filter((p) => p.type !== "literal").map((p) => [p.type, p.value]));
  return `${map.year}-${map.month}-${map.day}T${map.hour}:${map.minute}`;
}

function offsetMsAt(instant, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const map = Object.fromEntries(parts.filter((p) => p.type !== "literal").map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour),
    Number(map.minute),
    Number(map.second)
  );
  return asUtc - instant.getTime();
}

// Returns { iso } or { error: "invalid" | "unknown_zone" | "impossible" | "ambiguous" }.
export function wallTimeToIso(wall, timeZone) {
  if (!WALL_PATTERN.test(wall || "")) {
    return { error: "invalid" };
  }
  if (!isValidTimeZone(timeZone)) {
    return { error: "unknown_zone" };
  }

  const [, ys, ms, ds, hs, mins] = WALL_PATTERN.exec(wall);
  const year = Number(ys);
  const month = Number(ms);
  const day = Number(ds);
  const hour = Number(hs);
  const minute = Number(mins);

  // First guess: treat the wall clock as UTC, then subtract the zone offset.
  let guess = Date.UTC(year, month - 1, day, hour, minute, 0);
  const offset1 = offsetMsAt(new Date(guess), timeZone);
  guess = Date.UTC(year, month - 1, day, hour, minute, 0) - offset1;
  const offset2 = offsetMsAt(new Date(guess), timeZone);
  if (offset1 !== offset2) {
    guess = Date.UTC(year, month - 1, day, hour, minute, 0) - offset2;
  }

  const primary = new Date(guess);
  if (formatWallInZone(primary, timeZone) !== wall) {
    return { error: "impossible" };
  }

  // Fall-back ambiguity: another UTC instant one hour earlier may show the same wall time.
  const earlier = new Date(guess - 60 * 60 * 1000);
  if (formatWallInZone(earlier, timeZone) === wall && earlier.getTime() !== primary.getTime()) {
    return { error: "ambiguous" };
  }

  return { iso: primary.toISOString() };
}

export function describeWallTimeError(error, label = "time") {
  switch (error) {
    case "unknown_zone":
      return "Enter a valid IANA time zone such as Europe/Paris.";
    case "impossible":
      return `That ${label} does not exist in the selected time zone (often during daylight-saving changes).`;
    case "ambiguous":
      return `That ${label} is ambiguous in the selected time zone (daylight-saving fall-back). Pick a time outside the repeated hour.`;
    default:
      return `Please choose a valid ${label}.`;
  }
}
