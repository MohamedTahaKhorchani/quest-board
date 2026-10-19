// Client-side filters for a fully loaded quest list (demo or unpaginated API).
// Do not present these as searching the whole catalogue if the API is paginated.

function startOfLocalDay(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function categoriesFromQuests(quests) {
  const set = new Set();
  for (const quest of quests) {
    if (quest.category) set.add(quest.category);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

export function filterQuests(quests, { query = "", category = "", dateFilter = "all", from = "", to = "" } = {}) {
  const needle = query.trim().toLowerCase();
  const today = startOfLocalDay();
  const weekEnd = addDays(today, 7);
  const fromDate = from ? startOfLocalDay(new Date(`${from}T00:00:00`)) : null;
  const toDate = to ? startOfLocalDay(new Date(`${to}T00:00:00`)) : null;

  return quests.filter((quest) => {
    if (category && quest.category !== category) return false;

    if (needle) {
      const haystack = `${quest.title} ${quest.location}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }

    const starts = new Date(quest.startsAt);
    if (Number.isNaN(starts.getTime())) return dateFilter === "all" && !from && !to;

    if (dateFilter === "today") {
      const day = startOfLocalDay(starts);
      if (day.getTime() !== today.getTime()) return false;
    } else if (dateFilter === "week") {
      if (starts < today || starts >= weekEnd) return false;
    } else if (dateFilter === "range") {
      const day = startOfLocalDay(starts);
      if (fromDate && day < fromDate) return false;
      if (toDate && day > toDate) return false;
    }

    return true;
  });
}

// Soonest upcoming published quest — used as a featured banner when data exists.
export function pickFeaturedQuest(quests) {
  const now = Date.now();
  const upcoming = quests
    .filter((quest) => quest.status === "published" && Date.parse(quest.startsAt) >= now)
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  return upcoming[0] || quests[0] || null;
}
