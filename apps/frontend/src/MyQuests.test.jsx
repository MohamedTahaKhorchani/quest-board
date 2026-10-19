import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, createQuest, listMyQuests, publishQuest } from "./api.js";
import MyQuests from "./MyQuests.jsx";

vi.mock("./api.js", async (importOriginal) => {
  const actual = await importOriginal();
  const createQuest = vi.fn();
  const listMyQuests = vi.fn();
  const publishQuest = vi.fn();
  return {
    ...actual,
    createQuest,
    listMyQuests,
    publishQuest,
    questsDemoEnabled: vi.fn(() => false),
    getQuestClient: () => ({
      isDemo: false,
      createQuest: (fields) => createQuest(fields, "tok"),
      listMyQuests: () => listMyQuests("tok"),
      publishQuest: (id) => publishQuest(id, "tok"),
    }),
  };
});

const SESSION = { token: "tok", userId: "4", expiresAt: "2099-01-01T00:00:00Z" };

function quest(overrides) {
  return {
    id: "11",
    title: "Campus cleanup",
    description: "Pick up litter.",
    location: "Quai d'Orsay",
    startsAt: "2026-10-20T12:00:00Z",
    endsAt: "2026-10-20T14:00:00Z",
    category: "Volunteering",
    proofInstructions: "Photo.",
    points: 50,
    status: "draft",
    organizerId: "4",
    ...overrides,
  };
}

function renderMyQuests(session = SESSION) {
  const onSessionExpired = vi.fn();
  render(<MyQuests session={session} onSessionExpired={onSessionExpired} />);
  return { onSessionExpired };
}

const questList = () => screen.getByRole("list", { name: "Your quests" });
const items = () => within(questList()).getAllByRole("listitem");
// The list's alert comes before the create form's alert.
const listAlert = () => screen.getAllByRole("alert")[0];
async function expectListAlert(text) {
  await waitFor(() => expect(listAlert()).toHaveTextContent(text));
}
const publishButton = (title = "Campus cleanup") =>
  screen.getByRole("button", { name: `Publish ${title}` });

beforeEach(() => {
  vi.resetAllMocks();
  listMyQuests.mockResolvedValue([]);
});

describe("My quests and publishing (QB-60)", () => {
  it("loads the organizer's own quests from the backend and shows their status", async () => {
    let finish;
    listMyQuests.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    renderMyQuests();

    expect(screen.getByRole("status")).toHaveTextContent("Loading your quests…");
    finish([quest(), quest({ id: "12", title: "Chess night", status: "published" })]);

    await screen.findByRole("list", { name: "Your quests" });
    expect(listMyQuests).toHaveBeenCalledWith("tok");
    expect(items()).toHaveLength(2);
    expect(items()[0]).toHaveTextContent("Campus cleanup");
    expect(items()[0]).toHaveTextContent("Draft");
    expect(items()[0]).toHaveTextContent("Quai d'Orsay · Volunteering · 50 points");
    expect(items()[1]).toHaveTextContent("Published");
    // Only drafts can be published.
    expect(publishButton()).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Publish Chess night" })).not.toBeInTheDocument();
  });

  it("shows an empty state", async () => {
    renderMyQuests();
    expect(await screen.findByText(/You haven't created any quests yet/)).toBeInTheDocument();
  });

  it("shows a retryable load error", async () => {
    const user = userEvent.setup();
    listMyQuests
      .mockRejectedValueOnce(new ApiError("Couldn't get a response.", 0))
      .mockResolvedValueOnce([quest()]);
    renderMyQuests();

    expect(await screen.findByText(/Couldn't get a response/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("Campus cleanup")).toBeInTheDocument();
    expect(listMyQuests).toHaveBeenCalledTimes(2);
  });

  it("explains when the quest API is missing", async () => {
    listMyQuests.mockRejectedValue(new ApiError("Not Found", 404));
    renderMyQuests();

    expect(await screen.findByText(/doesn't support that quest action/i)).toBeInTheDocument();
  });

  it("keeps the create form available when the list API is missing", async () => {
    const user = userEvent.setup();
    listMyQuests.mockRejectedValue(new ApiError("Not Found", 404));
    createQuest.mockResolvedValue(quest({ id: "99", title: "New draft" }));
    renderMyQuests();

    expect(await screen.findByText(/You can still create a draft below/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Create a quest" })).toBeInTheDocument();

    await user.type(screen.getByLabelText("Title"), "New draft");
    await user.type(screen.getByLabelText("Description"), "Details");
    await user.type(screen.getByLabelText("Location"), "Library");
    await user.type(screen.getByLabelText("Category"), "Academic");
    await user.type(screen.getByLabelText("Proof instructions"), "Sign in");
    await user.type(screen.getByLabelText("Points"), "10");
    await user.click(screen.getByLabelText("Starts"));
    await user.paste("2026-10-20T14:00");
    await user.click(screen.getByLabelText("Ends"));
    await user.paste("2026-10-20T16:00");
    await user.click(screen.getByRole("button", { name: "Save as draft" }));

    expect(await screen.findByText(/was saved as draft #99/)).toBeInTheDocument();
    expect(await screen.findByText("New draft")).toBeInTheDocument();
    expect(createQuest).toHaveBeenCalledTimes(1);
  });

  it("ends the session when loading is rejected with 401", async () => {
    listMyQuests.mockRejectedValue(new ApiError("Not authenticated", 401));
    const { onSessionExpired } = renderMyQuests();
    await waitFor(() => expect(onSessionExpired).toHaveBeenCalledTimes(1));
  });

  it("publishes a draft and updates the list", async () => {
    const user = userEvent.setup();
    listMyQuests.mockResolvedValue([quest()]);
    publishQuest.mockResolvedValue(quest({ status: "published" }));
    renderMyQuests();

    await user.click(await screen.findByRole("button", { name: "Publish Campus cleanup" }));

    expect(publishQuest).toHaveBeenCalledWith("11", "tok");
    expect(await screen.findByText('"Campus cleanup" is now published.')).toBeInTheDocument();
    expect(items()[0]).toHaveTextContent("Published");
    expect(screen.queryByRole("button", { name: /^Publish/ })).not.toBeInTheDocument();
  });

  it("ignores repeated clicks while publishing", async () => {
    const user = userEvent.setup();
    let finish;
    listMyQuests.mockResolvedValue([quest()]);
    publishQuest.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    renderMyQuests();

    await user.click(await screen.findByRole("button", { name: "Publish Campus cleanup" }));
    expect(publishButton()).toBeDisabled();
    expect(publishButton()).toHaveTextContent("Publishing…");
    await user.click(publishButton());

    expect(publishQuest).toHaveBeenCalledTimes(1);
    finish(quest({ status: "published" }));
    expect(await screen.findByText('"Campus cleanup" is now published.')).toBeInTheDocument();
  });

  it("treats a conflict as already published and reloads", async () => {
    const user = userEvent.setup();
    listMyQuests
      .mockResolvedValueOnce([quest()])
      .mockResolvedValueOnce([quest({ status: "published" })]);
    publishQuest.mockRejectedValue(
      new ApiError("Quest already published", 409, {}, "quest_already_published")
    );
    renderMyQuests();

    await user.click(await screen.findByRole("button", { name: "Publish Campus cleanup" }));

    expect(await screen.findByText('"Campus cleanup" was already published.')).toBeInTheDocument();
    await waitFor(() => expect(items()[0]).toHaveTextContent("Published"));
    expect(listMyQuests).toHaveBeenCalledTimes(2);
  });

  it("shows a permission error and keeps the draft", async () => {
    const user = userEvent.setup();
    listMyQuests.mockResolvedValue([quest()]);
    publishQuest.mockRejectedValue(new ApiError("Not your quest", 403));
    renderMyQuests();

    await user.click(await screen.findByRole("button", { name: "Publish Campus cleanup" }));

    await expectListAlert(
      `You don't have permission to publish "Campus cleanup". Not your quest`
    );
    expect(publishButton()).toBeEnabled();
  });

  it("ends the session when publishing is rejected with 401", async () => {
    const user = userEvent.setup();
    listMyQuests.mockResolvedValue([quest()]);
    publishQuest.mockRejectedValue(new ApiError("Not authenticated", 401));
    const { onSessionExpired } = renderMyQuests();

    await user.click(await screen.findByRole("button", { name: "Publish Campus cleanup" }));

    await waitFor(() => expect(onSessionExpired).toHaveBeenCalledTimes(1));
  });

  describe("when the result of publishing is unknown", () => {
    const lost = () => new ApiError("Couldn't get a response.", 0);

    it("reloads the list and reports success if it went through", async () => {
      const user = userEvent.setup();
      listMyQuests
        .mockResolvedValueOnce([quest()])
        .mockResolvedValueOnce([quest({ status: "published" })]);
      publishQuest.mockRejectedValue(lost());
      renderMyQuests();

      await user.click(await screen.findByRole("button", { name: "Publish Campus cleanup" }));

      expect(await screen.findByText('"Campus cleanup" is now published.')).toBeInTheDocument();
      expect(items()[0]).toHaveTextContent("Published");
      expect(publishQuest).toHaveBeenCalledTimes(1);
    });

    it("says it couldn't confirm when the quest is still a draft", async () => {
      const user = userEvent.setup();
      listMyQuests.mockResolvedValue([quest()]);
      publishQuest.mockRejectedValue(lost());
      renderMyQuests();

      await user.click(await screen.findByRole("button", { name: "Publish Campus cleanup" }));

      await expectListAlert(
        `We couldn't confirm the result of publishing "Campus cleanup". Couldn't get a response. ` +
          "The server still shows it as a draft, so you can publish it again."
      );
      expect(publishQuest).toHaveBeenCalledTimes(1);
      expect(publishButton()).toBeEnabled();
    });

    it("says it couldn't confirm when the list can't be reloaded", async () => {
      const user = userEvent.setup();
      listMyQuests.mockResolvedValueOnce([quest()]).mockRejectedValueOnce(lost());
      publishQuest.mockRejectedValue(lost());
      renderMyQuests();

      await user.click(await screen.findByRole("button", { name: "Publish Campus cleanup" }));

      await expectListAlert(
        "Reload your quests to check before trying again."
      );
      // The last known status stays on screen; it is not shown as failed.
      expect(items()[0]).toHaveTextContent("Draft");
      expect(publishQuest).toHaveBeenCalledTimes(1);
    });
  });

  it("adds a newly created draft to the top of the list", async () => {
    const user = userEvent.setup();
    listMyQuests.mockResolvedValue([quest({ id: "5", title: "Older", status: "published" })]);
    createQuest.mockResolvedValue(quest({ id: "12", title: "New quest" }));
    renderMyQuests();
    await screen.findByText("Older");

    await user.type(screen.getByLabelText("Title"), "New quest");
    await user.type(screen.getByLabelText("Description"), "Details");
    await user.type(screen.getByLabelText("Location"), "Library");
    await user.click(screen.getByLabelText("Starts"));
    await user.paste("2026-10-20T14:00");
    await user.click(screen.getByLabelText("Ends"));
    await user.paste("2026-10-20T15:00");
    await user.type(screen.getByLabelText("Category"), "Culture");
    await user.type(screen.getByLabelText("Proof instructions"), "Photo");
    await user.type(screen.getByLabelText("Points"), "10");
    await user.click(screen.getByRole("button", { name: "Save as draft" }));

    await waitFor(() => expect(items()).toHaveLength(2));
    expect(items()[0]).toHaveTextContent("New quest");
    expect(items()[0]).toHaveTextContent("Draft");
    expect(publishButton("New quest")).toBeInTheDocument();
  });
});
