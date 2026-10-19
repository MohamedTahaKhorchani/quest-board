import { beforeEach, describe, expect, it } from "vitest";
import {
  demoCreateQuest,
  demoJoinQuest,
  demoListMyParticipations,
  demoListMyQuests,
  demoListPublishedQuests,
  demoPublishQuest,
  resetDemoQuests,
} from "./demoQuests.js";

beforeEach(async () => {
  sessionStorage.clear();
  await resetDemoQuests();
});

describe("Quest demo store", () => {
  it("seeds published quests and drafts", async () => {
    const published = await demoListPublishedQuests();
    const mine = await demoListMyQuests();

    expect(published.map((quest) => quest.title)).toEqual([
      "Campus cleanup",
      "Chess night",
      "Pickup football",
      "Study sprint: midterms",
      "Gallery opening night",
      "Neighborhood food walk",
    ]);
    expect(mine.some((quest) => quest.status === "draft")).toBe(true);
  });

  it("creates, publishes, joins, and restores joined status without touching the network", async () => {
    const created = await demoCreateQuest({
      title: "New demo quest",
      description: "Details",
      location: "Library",
      starts_at: "2026-10-20T12:00:00.000Z",
      ends_at: "2026-10-20T14:00:00.000Z",
      time_zone: "Europe/Paris",
      category: "Culture",
      proof_instructions: "Photo",
      point_value: 10,
    });
    expect(created.status).toBe("draft");

    const published = await demoPublishQuest(created.id);
    expect(published.status).toBe("published");

    await demoJoinQuest(created.id, "user-7");
    expect((await demoListMyParticipations("user-7")).map((item) => item.questId)).toContain(
      created.id
    );

    await expect(demoJoinQuest(created.id, "user-7")).rejects.toMatchObject({
      status: 409,
      code: "quest_already_joined",
    });
  });

  it("resets only demo data", async () => {
    await demoJoinQuest("demo-1", "user-7");
    await resetDemoQuests();
    expect(await demoListMyParticipations("user-7")).toEqual([]);
    expect((await demoListPublishedQuests()).length).toBe(6);
  });
});
