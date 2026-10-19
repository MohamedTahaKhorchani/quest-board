import { useEffect, useRef, useState } from "react";
import { getQuestClient, questApiUnavailableMessage } from "./api.js";
import { formatTimeWindow, questStatusLabel } from "./format.js";
import QuestForm from "./QuestForm.jsx";

// The signed-in organizer's own quests (QB-60), with Publish for drafts and create (QB-58).
function MyQuests({ session, openCreate = false, onSessionExpired }) {
  const client = getQuestClient(session);
  const createRef = useRef(null);
  const [quests, setQuests] = useState([]);
  const [status, setStatus] = useState("loading");
  const [loadError, setLoadError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [isReloading, setIsReloading] = useState(false);
  const [publishingIds, setPublishingIds] = useState([]);
  const [actionError, setActionError] = useState("");
  const [actionMessage, setActionMessage] = useState("");

  useEffect(() => {
    if (!openCreate || !createRef.current) return;
    createRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    const title = createRef.current.querySelector("#quest-title");
    if (title) title.focus();
  }, [openCreate]);

  useEffect(() => {
    let ignore = false;
    const keepList = status === "loaded";
    if (keepList) {
      setIsReloading(true);
    } else {
      setStatus("loading");
    }

    client
      .listMyQuests()
      .then((list) => {
        if (ignore) return;
        setQuests(list);
        setStatus("loaded");
        setIsReloading(false);
      })
      .catch((error) => {
        if (ignore) return;
        if (error.status === 401) {
          onSessionExpired();
          return;
        }
        const message = questApiUnavailableMessage(error, "load your quests");
        if (keepList) {
          setActionError(`Your quests couldn't be reloaded. ${message}`);
          setIsReloading(false);
        } else {
          setLoadError(message);
          setStatus("error");
        }
      });

    return () => {
      ignore = true;
    };
  }, [session.token, session.userId, loadAttempt]);

  function reload() {
    setActionError("");
    setActionMessage("");
    setLoadAttempt((attempt) => attempt + 1);
  }

  function replaceQuest(updated) {
    setQuests((list) => list.map((quest) => (quest.id === updated.id ? updated : quest)));
  }

  async function checkWhetherPublished(quest, error) {
    let list;
    try {
      list = await client.listMyQuests();
    } catch (reloadError) {
      if (reloadError.status === 401) {
        onSessionExpired();
        return;
      }
      setActionError(
        `We couldn't confirm the result of publishing "${quest.title}". ${error.message} ` +
          "Reload your quests to check before trying again."
      );
      return;
    }

    setQuests(list);
    const current = list.find((item) => item.id === quest.id);
    if (current && current.status === "published") {
      setActionMessage(`"${quest.title}" is now published.`);
    } else {
      setActionError(
        `We couldn't confirm the result of publishing "${quest.title}". ${error.message} ` +
          "The server still shows it as a draft, so you can publish it again."
      );
    }
  }

  async function handlePublish(quest) {
    if (publishingIds.includes(quest.id)) return;
    if (Date.now() >= Date.parse(session.expiresAt)) {
      onSessionExpired();
      return;
    }

    setPublishingIds((ids) => [...ids, quest.id]);
    setActionError("");
    setActionMessage("");
    try {
      const published = await client.publishQuest(quest.id);
      replaceQuest(published);
      setActionMessage(`"${quest.title}" is now published.`);
    } catch (error) {
      if (error.status === 401) {
        onSessionExpired();
        return;
      }
      if (error.resultUnknown) {
        await checkWhetherPublished(quest, error);
      } else if (error.status === 409) {
        setActionMessage(`"${quest.title}" was already published.`);
        setLoadAttempt((attempt) => attempt + 1);
      } else if (error.status === 403) {
        setActionError(`You don't have permission to publish "${quest.title}". ${error.message}`);
      } else if (error.status === 404 || error.status === 405 || error.isUnsupported) {
        setActionError(questApiUnavailableMessage(error, `publish "${quest.title}"`));
      } else {
        setActionError(`"${quest.title}" couldn't be published. ${error.message}`);
      }
    } finally {
      setPublishingIds((ids) => ids.filter((id) => id !== quest.id));
    }
  }

  let content;
  if (status === "loading") {
    content = (
      <div className="panel-state" role="status">
        Loading your quests…
      </div>
    );
  } else if (status === "error") {
    content = (
      <div className="panel-state">
        <p className="form-error form-error-left">{loadError}</p>
        <p className="hint">
          You can still create a draft below if the create API is available. Saving does not depend
          on this list.
        </p>
        <button type="button" className="button button-secondary button-inline" onClick={reload}>
          Try again
        </button>
      </div>
    );
  } else {
    content = (
      <>
        <div className="list-toolbar">
          {isReloading ? (
            <span className="muted small" role="status">
              Reloading your quests…
            </span>
          ) : (
            <span className="muted small">
              {quests.length === 0
                ? "No quests yet"
                : `${quests.length} quest${quests.length === 1 ? "" : "s"}`}
            </span>
          )}
          <button
            type="button"
            className="button button-secondary button-small"
            onClick={reload}
            disabled={isReloading}
          >
            Reload
          </button>
        </div>
        {quests.length === 0 ? (
          <div className="panel-state muted">
            You haven't created any quests yet. Use the form below to save a draft.
          </div>
        ) : (
          <ul className="quest-grid" aria-label="Your quests">
            {quests.map((quest) => {
              const isPublishing = publishingIds.includes(quest.id);
              return (
                <li key={quest.id} className="quest-card">
                  <div className="request-heading">
                    <strong>{quest.title}</strong>
                    <span className={`status status-${quest.status}`}>
                      {questStatusLabel(quest.status)}
                    </span>
                  </div>
                  <p className="small muted request-meta">
                    {formatTimeWindow(quest.startsAt, quest.endsAt)}
                  </p>
                  <p className="small muted request-meta">
                    {quest.location} · {quest.category} · {quest.points} points
                  </p>
                  {quest.status === "draft" && (
                    <div className="request-actions">
                      <button
                        type="button"
                        className="button button-small"
                        onClick={() => handlePublish(quest)}
                        disabled={isPublishing}
                        aria-label={`Publish ${quest.title}`}
                      >
                        {isPublishing ? "Publishing…" : "Publish"}
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <p className="form-error form-error-left" role="alert">
          {actionError}
        </p>
        <p className="message message-left" aria-live="polite">
          {actionMessage}
        </p>
      </>
    );
  }

  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <h2 className="screen-title">My quests</h2>
          <p className="hint section-hint">
            New quests are saved as drafts. Students only see a quest once you publish it.
          </p>
        </div>
      </header>
      {content}

      <section
        ref={createRef}
        className="section panel"
        aria-labelledby="create-quest-title"
      >
        <h3 className="section-title" id="create-quest-title">
          Create a quest
        </h3>
        <QuestForm
          session={session}
          onCreated={(quest) => {
            // Prefetch list may be unavailable; still show the confirmed create response.
            setQuests((list) => [quest, ...list.filter((item) => item.id !== quest.id)]);
            if (status === "error") setStatus("loaded");
          }}
          onSessionExpired={onSessionExpired}
        />
      </section>
    </div>
  );
}

export default MyQuests;
