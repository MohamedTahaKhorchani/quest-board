import { describe, expect, it } from "vitest";
import { categoriesFromQuests, filterQuests, pickFeaturedQuest } from "./questFilters.js";

function localIso(offsetDays, hour = 14) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
}

function ymd(offsetDays) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const quests = [
  {
    id: "1",
    title: "Campus cleanup",
    location: "Quai d'Orsay",
    category: "Volunteering",
    startsAt: localIso(0),
    status: "published",
  },
  {
    id: "2",
    title: "Chess night",
    location: "Student lounge",
    category: "Culture",
    startsAt: localIso(2),
    status: "published",
  },
  {
    id: "3",
    title: "Gallery night",
    location: "AMEX gallery",
    category: "Arts",
    startsAt: localIso(14),
    status: "published",
  },
];

describe("questFilters", () => {
  it("lists unique categories", () => {
    expect(categoriesFromQuests(quests)).toEqual(["Arts", "Culture", "Volunteering"]);
  });

  it("searches title and location", () => {
    expect(filterQuests(quests, { query: "lounge" }).map((quest) => quest.id)).toEqual(["2"]);
    expect(filterQuests(quests, { query: "campus" }).map((quest) => quest.id)).toEqual(["1"]);
  });

  it("filters by category", () => {
    expect(filterQuests(quests, { category: "Arts" }).map((quest) => quest.id)).toEqual(["3"]);
  });

  it("filters today and this week in local time", () => {
    const today = filterQuests(quests, { dateFilter: "today" });
    expect(today.map((quest) => quest.id)).toEqual(["1"]);

    const week = filterQuests(quests, { dateFilter: "week" });
    expect(week.map((quest) => quest.id)).toEqual(["1", "2"]);
  });

  it("filters a date range", () => {
    const ranged = filterQuests(quests, {
      dateFilter: "range",
      from: ymd(1),
      to: ymd(5),
    });
    expect(ranged.map((quest) => quest.id)).toEqual(["2"]);
  });

  it("picks the soonest upcoming published quest", () => {
    expect(pickFeaturedQuest(quests).id).toBe("1");
  });
});
