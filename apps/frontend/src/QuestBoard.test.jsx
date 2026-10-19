import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, joinQuest, listMyParticipations, listPublishedQuests } from "./api.js";
import QuestBoard from "./QuestBoard.jsx";

vi.mock("./api.js", async (importOriginal) => {
  const actual = await importOriginal();
  const joinQuest = vi.fn();
  const listMyParticipations = vi.fn();
  const listPublishedQuests = vi.fn();
  return {
    ...actual,
    joinQuest,
    listMyParticipations,
    listPublishedQuests,
    questsDemoEnabled: vi.fn(() => false),
    getQuestClient: () => ({
      isDemo: false,
      joinQuest: (id) => joinQuest(id, "tok"),
      listMyParticipations: () => listMyParticipations("tok"),
      listPublishedQuests: () => listPublishedQuests("tok"),
    }),
  };
});

const SESSION = { token: "tok", userId: "7", expiresAt: "2099-01-01T00:00:00Z" };

function quest(overrides) {
  return {
    id: "11",
    title: "Campus cleanup",
    description: "Pick up litter around the library.",
    location: "Quai d'Orsay",
    startsAt: "2026-10-20T12:00:00Z",
    endsAt: "2026-10-20T14:00:00Z",
    category: "Volunteering",
    proofInstructions: "A photo of your full bag.",
    points: 50,
    status: "published",
    organizerId: "4",
    ...overrides,
  };
}

const participation = (questId) => ({ id: `p${questId}`, questId, status: "joined", joinedAt: "" });

function renderBoard({ canJoin = true, session = SESSION } = {}) {
  const onSessionExpired = vi.fn();
  render(<QuestBoard session={session} canJoin={canJoin} onSessionExpired={onSessionExpired} />);
  return { onSessionExpired };
}

const joinButton = () => screen.getByRole("button", { name: "Join quest" });
const open = async (user, title = "Campus cleanup") =>
  user.click(await screen.findByRole("button", { name: `View quest: ${title}` }));

beforeEach(() => {
  vi.resetAllMocks();
  listPublishedQuests.mockResolvedValue([quest()]);
  listMyParticipations.mockResolvedValue([]);
});

describe("Joining quests (QB-90)", () => {
  it("lists published quests and marks the ones already joined, from the backend", async () => {
    listPublishedQuests.mockResolvedValue([quest(), quest({ id: "12", title: "Chess night" })]);
    listMyParticipations.mockResolvedValue([participation("12")]);
    renderBoard();

    expect(screen.getByRole("status")).toHaveTextContent("Loading quests…");
    const list = await screen.findByRole("list", { name: "Published quests" });
    const items = within(list).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Campus cleanup");
    expect(items[0]).not.toHaveTextContent("Joined");
    expect(items[1]).toHaveTextContent("Chess night");
    expect(items[1]).toHaveTextContent("Joined");
    expect(listPublishedQuests).toHaveBeenCalledWith("tok");
    expect(listMyParticipations).toHaveBeenCalledWith("tok");
  });

  it("shows an empty state", async () => {
    listPublishedQuests.mockResolvedValue([]);
    renderBoard();
    expect(await screen.findByText("There are no published quests yet.")).toBeInTheDocument();
  });

  it("shows a retryable load error", async () => {
    const user = userEvent.setup();
    listMyParticipations
      .mockRejectedValueOnce(new ApiError("Couldn't get a response.", 0))
      .mockResolvedValueOnce([]);
    renderBoard();

    expect(await screen.findByText(/Couldn't get a response/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(
      await screen.findByRole("button", { name: "View quest: Campus cleanup" })
    ).toBeInTheDocument();
  });

  it("explains when the quest API is missing", async () => {
    listPublishedQuests.mockRejectedValue(new ApiError("Not Found", 404));
    renderBoard();

    expect(await screen.findByText(/doesn't support that quest action/i)).toBeInTheDocument();
    expect(screen.getByText(/VITE_QUESTS_DEMO=true/i)).toBeInTheDocument();
  });

  it("ends the session when loading is rejected with 401", async () => {
    listPublishedQuests.mockRejectedValue(new ApiError("Not authenticated", 401));
    const { onSessionExpired } = renderBoard();
    await waitFor(() => expect(onSessionExpired).toHaveBeenCalledTimes(1));
  });

  it("opens a quest's details", async () => {
    const user = userEvent.setup();
    renderBoard();

    await open(user);

    expect(screen.getByRole("heading", { name: "Campus cleanup" })).toBeInTheDocument();
    expect(screen.getByText("Pick up litter around the library.")).toBeInTheDocument();
    expect(screen.getByText("A photo of your full bag.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Join quest" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "← All quests" }));
    expect(screen.getByRole("list", { name: "Published quests" })).toBeInTheDocument();
  });

  it("joins a quest and shows the joined status", async () => {
    const user = userEvent.setup();
    joinQuest.mockResolvedValue(participation("11"));
    renderBoard();

    await open(user);
    await user.click(joinButton());

    expect(joinQuest).toHaveBeenCalledWith("11", "tok");
    expect(await screen.findByText('You joined "Campus cleanup".')).toBeInTheDocument();
    expect(screen.getByText("You've joined this quest.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Join quest" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "← All quests" }));
    expect(screen.getByRole("listitem")).toHaveTextContent("Joined");
  });

  it("restores the joined status after a reload from the participation list", async () => {
    const user = userEvent.setup();
    listMyParticipations.mockResolvedValue([participation("11")]);
    renderBoard();

    await open(user);

    expect(screen.getByText("You've joined this quest.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Join quest" })).not.toBeInTheDocument();
  });

  it("ignores repeated clicks while joining", async () => {
    const user = userEvent.setup();
    let finish;
    joinQuest.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    renderBoard();

    await open(user);
    await user.click(joinButton());
    const button = screen.getByRole("button", { name: "Joining…" });
    expect(button).toBeDisabled();
    await user.click(button);

    expect(joinQuest).toHaveBeenCalledTimes(1);
    finish(participation("11"));
    expect(await screen.findByText("You've joined this quest.")).toBeInTheDocument();
  });

  it("treats a duplicate-join conflict as already joined", async () => {
    const user = userEvent.setup();
    joinQuest.mockRejectedValue(
      new ApiError("You already joined this quest.", 409, {}, "quest_already_joined")
    );
    renderBoard();

    await open(user);
    await user.click(joinButton());

    expect(
      await screen.findByText(`You've already joined "Campus cleanup".`)
    ).toBeInTheDocument();
    expect(screen.getByText("You've joined this quest.")).toBeInTheDocument();
  });

  it("doesn't treat another conflict as joined", async () => {
    const user = userEvent.setup();
    joinQuest.mockRejectedValue(new ApiError("The quest is full.", 409, {}, "quest_full"));
    renderBoard();

    await open(user);
    await user.click(joinButton());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      `You couldn't join "Campus cleanup". The quest is full.`
    );
    expect(joinButton()).toBeEnabled();
  });

  it("shows a permission error", async () => {
    const user = userEvent.setup();
    joinQuest.mockRejectedValue(new ApiError("Insufficient role", 403));
    renderBoard();

    await open(user);
    await user.click(joinButton());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      `You can't join "Campus cleanup". Insufficient role`
    );
  });

  it("goes back to the reloaded list when the quest is gone", async () => {
    const user = userEvent.setup();
    joinQuest.mockRejectedValue(new ApiError("Quest not found", 404));
    renderBoard();

    await open(user);
    listPublishedQuests.mockResolvedValue([]);
    await user.click(joinButton());

    expect(await screen.findByText("There are no published quests yet.")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(`"Campus cleanup" is no longer available.`);
  });

  it("ends the session when joining is rejected with 401", async () => {
    const user = userEvent.setup();
    joinQuest.mockRejectedValue(new ApiError("Not authenticated", 401));
    const { onSessionExpired } = renderBoard();

    await open(user);
    await user.click(joinButton());

    await waitFor(() => expect(onSessionExpired).toHaveBeenCalledTimes(1));
  });

  it("ends the session instead of joining once the token has expired", async () => {
    const user = userEvent.setup();
    const { onSessionExpired } = renderBoard({
      session: { ...SESSION, expiresAt: new Date(Date.now() + 60000).toISOString() },
    });
    await open(user);

    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(Date.now() + 120000);
    try {
      await user.click(joinButton());
    } finally {
      nowSpy.mockRestore();
    }

    expect(onSessionExpired).toHaveBeenCalledTimes(1);
    expect(joinQuest).not.toHaveBeenCalled();
  });

  it("doesn't offer joining to users without the student role", async () => {
    const user = userEvent.setup();
    renderBoard({ canJoin: false });

    await open(user);

    expect(screen.queryByRole("button", { name: "Join quest" })).not.toBeInTheDocument();
    expect(screen.getByText("Only students can join quests.")).toBeInTheDocument();
  });

  describe("when the result of joining is unknown", () => {
    const lost = () => new ApiError("Couldn't get a response.", 0);

    it("reloads participations and reports the join if it went through", async () => {
      const user = userEvent.setup();
      joinQuest.mockRejectedValue(lost());
      renderBoard();

      await open(user);
      listMyParticipations.mockResolvedValue([participation("11")]);
      await user.click(joinButton());

      expect(await screen.findByText('You joined "Campus cleanup".')).toBeInTheDocument();
      expect(screen.getByText("You've joined this quest.")).toBeInTheDocument();
      expect(joinQuest).toHaveBeenCalledTimes(1);
    });

    it("says it couldn't confirm when the server doesn't show the user as joined", async () => {
      const user = userEvent.setup();
      joinQuest.mockRejectedValue(lost());
      renderBoard();

      await open(user);
      await user.click(joinButton());

      expect(await screen.findByRole("alert")).toHaveTextContent(
        `We couldn't confirm whether you joined "Campus cleanup". Couldn't get a response. ` +
          "The server doesn't show you as joined, so you can try again."
      );
      expect(joinQuest).toHaveBeenCalledTimes(1);
      expect(joinButton()).toBeEnabled();
    });

    it("says it couldn't confirm when participations can't be reloaded", async () => {
      const user = userEvent.setup();
      joinQuest.mockRejectedValue(lost());
      renderBoard();

      await open(user);
      listMyParticipations.mockRejectedValue(lost());
      await user.click(joinButton());

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Use Reload to check before trying again."
      );
      expect(screen.queryByText("You've joined this quest.")).not.toBeInTheDocument();
      expect(joinQuest).toHaveBeenCalledTimes(1);
    });
  });

  it("keeps the open quest open after Reload", async () => {
    const user = userEvent.setup();
    renderBoard();

    await open(user);
    listMyParticipations.mockResolvedValue([participation("11")]);
    await user.click(screen.getByRole("button", { name: "Reload" }));

    expect(await screen.findByText("You've joined this quest.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Campus cleanup" })).toBeInTheDocument();
  });

  it("filters the loaded list by search and category", async () => {
    const user = userEvent.setup();
    listPublishedQuests.mockResolvedValue([
      quest(),
      quest({
        id: "12",
        title: "Chess night",
        location: "Student lounge",
        category: "Culture",
        startsAt: "2026-10-16T18:00:00Z",
        endsAt: "2026-10-16T20:00:00Z",
      }),
    ]);
    renderBoard();

    expect(
      await screen.findByRole("heading", { name: "What's your next campus adventure?" })
    ).toBeInTheDocument();
    expect(screen.getByText(/2 quests on the board/)).toBeInTheDocument();

    await user.type(screen.getByLabelText("Search"), "chess");
    expect(screen.getByText(/1 of 2 quests match your filters/)).toBeInTheDocument();
    expect(screen.queryByText("Campus cleanup")).not.toBeInTheDocument();
    expect(screen.getByText("Chess night")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    await user.click(screen.getByRole("button", { name: "Volunteering" }));
    expect(screen.getByText("Campus cleanup")).toBeInTheDocument();
    expect(screen.queryByText("Chess night")).not.toBeInTheDocument();
  });

  it("shows a no-results state for filters", async () => {
    const user = userEvent.setup();
    renderBoard();

    await screen.findByRole("button", { name: "View quest: Campus cleanup" });
    await user.type(screen.getByLabelText("Search"), "zzz-missing");
    expect(
      screen.getByText(/No quests match these filters/)
    ).toBeInTheDocument();
  });
});
