import { useEffect, useMemo, useState } from "react";
import { getQuestClient, questApiUnavailableMessage } from "./api.js";
import { formatTimeWindow } from "./format.js";
import { bannerClassName } from "./questBanners.js";
import { categoriesFromQuests, filterQuests, pickFeaturedQuest } from "./questFilters.js";
import QuestCard from "./QuestCard.jsx";

const EMPTY_FILTERS = {
  query: "",
  category: "",
  dateFilter: "all",
  from: "",
  to: "",
};

// Published quests + detail join (QB-90). Discovery filters run on the full loaded list.
function QuestBoard({ session, canJoin, onSessionExpired }) {
  const client = getQuestClient(session);
  const [quests, setQuests] = useState([]);
  const [joinedIds, setJoinedIds] = useState([]);
  const [status, setStatus] = useState("loading");
  const [loadError, setLoadError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [selectedId, setSelectedId] = useState(null);
  const [isJoining, setIsJoining] = useState(false);
  const [actionError, setActionError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [filters, setFilters] = useState(EMPTY_FILTERS);

  useEffect(() => {
    let ignore = false;
    setStatus("loading");

    Promise.all([client.listPublishedQuests(), client.listMyParticipations()])
      .then(([list, participations]) => {
        if (ignore) return;
        setQuests(list);
        setJoinedIds(participations.map((participation) => participation.questId));
        setStatus("loaded");
      })
      .catch((error) => {
        if (ignore) return;
        if (error.status === 401) {
          onSessionExpired();
          return;
        }
        setLoadError(questApiUnavailableMessage(error, "load quests"));
        setStatus("error");
      });

    return () => {
      ignore = true;
    };
  }, [session.token, session.userId, loadAttempt]);

  const categories = useMemo(() => categoriesFromQuests(quests), [quests]);
  const filtered = useMemo(() => filterQuests(quests, filters), [quests, filters]);
  const featured = useMemo(() => pickFeaturedQuest(filtered.length ? filtered : quests), [filtered, quests]);
  const filtersActive =
    Boolean(filters.query.trim()) ||
    Boolean(filters.category) ||
    filters.dateFilter !== "all";

  function reload() {
    setActionError("");
    setActionMessage("");
    setLoadAttempt((attempt) => attempt + 1);
  }

  function openQuest(questId) {
    setSelectedId(questId);
    setActionError("");
    setActionMessage("");
  }

  function updateFilter(patch) {
    setFilters((current) => ({ ...current, ...patch }));
  }

  function clearFilters() {
    setFilters(EMPTY_FILTERS);
  }

  function markJoined(questId) {
    setJoinedIds((ids) => (ids.includes(questId) ? ids : [...ids, questId]));
  }

  async function checkWhetherJoined(quest, error) {
    let participations;
    try {
      participations = await client.listMyParticipations();
    } catch (reloadError) {
      if (reloadError.status === 401) {
        onSessionExpired();
        return;
      }
      setActionError(
        `We couldn't confirm whether you joined "${quest.title}". ${error.message} ` +
          "Use Reload to check before trying again."
      );
      return;
    }

    const ids = participations.map((participation) => participation.questId);
    setJoinedIds(ids);
    if (ids.includes(quest.id)) {
      setActionMessage(`You joined "${quest.title}".`);
    } else {
      setActionError(
        `We couldn't confirm whether you joined "${quest.title}". ${error.message} ` +
          "The server doesn't show you as joined, so you can try again."
      );
    }
  }

  async function handleJoin(quest) {
    if (isJoining || joinedIds.includes(quest.id)) return;
    if (Date.now() >= Date.parse(session.expiresAt)) {
      onSessionExpired();
      return;
    }

    setIsJoining(true);
    setActionError("");
    setActionMessage("");
    try {
      await client.joinQuest(quest.id);
      markJoined(quest.id);
      setActionMessage(`You joined "${quest.title}".`);
    } catch (error) {
      if (error.status === 401) {
        onSessionExpired();
        return;
      }
      if (error.resultUnknown) {
        await checkWhetherJoined(quest, error);
      } else if (error.status === 409 && error.code === "quest_already_joined") {
        markJoined(quest.id);
        setActionMessage(`You've already joined "${quest.title}".`);
      } else if (error.status === 403) {
        setActionError(`You can't join "${quest.title}". ${error.message}`);
      } else if (error.status === 404 || error.status === 405 || error.isUnsupported) {
        if (error.message === "Quest not found") {
          setSelectedId(null);
          setLoadAttempt((attempt) => attempt + 1);
          setActionError(`"${quest.title}" is no longer available.`);
        } else {
          setActionError(questApiUnavailableMessage(error, `join "${quest.title}"`));
        }
      } else {
        setActionError(`You couldn't join "${quest.title}". ${error.message}`);
      }
    } finally {
      setIsJoining(false);
    }
  }

  const selected = quests.find((quest) => quest.id === selectedId);

  let content;
  if (status === "loading") {
    content = (
      <div className="panel-state" role="status">
        Loading quests…
      </div>
    );
  } else if (status === "error") {
    content = (
      <div className="panel-state">
        <p className="form-error form-error-left">{loadError}</p>
        <button type="button" className="button button-secondary button-inline" onClick={reload}>
          Try again
        </button>
      </div>
    );
  } else if (selected) {
    const joined = joinedIds.includes(selected.id);
    content = (
      <article className="quest-detail panel" aria-labelledby="quest-detail-title">
        <button type="button" className="link-button small" onClick={() => openQuest(null)}>
          ← All quests
        </button>
        <div className={`${bannerClassName(selected.category)} quest-detail-banner`} aria-hidden="true">
          <span className="quest-banner-stamp">Quest</span>
        </div>
        <div className="request-heading quest-detail-heading">
          <h3 className="section-title" id="quest-detail-title">
            {selected.title}
          </h3>
          {joined && <span className="badge badge-joined">Joined</span>}
        </div>
        <div className="quest-card-meta">
          <span className="badge badge-category">{selected.category || "Campus"}</span>
          <span className="badge badge-points">{selected.points ?? "—"} pts</span>
        </div>
        <dl className="quest-facts small">
          <dt>When</dt>
          <dd>{formatTimeWindow(selected.startsAt, selected.endsAt)}</dd>
          <dt>Where</dt>
          <dd>{selected.location}</dd>
          <dt>Category</dt>
          <dd>{selected.category}</dd>
          <dt>Points</dt>
          <dd>{selected.points}</dd>
        </dl>
        <p className="quest-text">{selected.description}</p>
        <h4 className="quest-subtitle">How to show you did it</h4>
        <p className="quest-text">{selected.proofInstructions}</p>

        {joined ? (
          <p className="message quest-joined">You've joined this quest.</p>
        ) : canJoin ? (
          <button
            type="button"
            className="button button-inline"
            onClick={() => handleJoin(selected)}
            disabled={isJoining}
          >
            {isJoining ? "Joining…" : "Join quest"}
          </button>
        ) : (
          <p className="hint">Only students can join quests.</p>
        )}
        <p className="form-error form-error-left" role="alert">
          {actionError}
        </p>
        <p className="message message-left" aria-live="polite">
          {actionMessage}
        </p>
      </article>
    );
  } else {
    content = (
      <>
        {quests.length === 0 ? (
          <div className="panel-state muted">There are no published quests yet.</div>
        ) : (
          <>
            {featured && !filtersActive && (
              <section className="featured-quest" aria-labelledby="featured-quest-title">
                <div className={`${bannerClassName(featured.category)} featured-banner`} aria-hidden="true">
                  <span className="quest-banner-stamp">Coming up</span>
                </div>
                <div className="featured-body">
                  <p className="eyebrow">Next on the board</p>
                  <h3 id="featured-quest-title">{featured.title}</h3>
                  <p className="small muted">
                    {formatTimeWindow(featured.startsAt, featured.endsAt)} · {featured.location}
                  </p>
                  <div className="quest-card-meta">
                    <span className="badge badge-category">{featured.category || "Campus"}</span>
                    <span className="badge badge-points">{featured.points ?? "—"} pts</span>
                    {joinedIds.includes(featured.id) && (
                      <span className="badge badge-joined">Joined</span>
                    )}
                  </div>
                  <button
                    type="button"
                    className="button button-inline"
                    onClick={() => openQuest(featured.id)}
                  >
                    View quest
                  </button>
                </div>
              </section>
            )}

            <section className="discovery-filters" aria-label="Search and filters">
              <div className="filter-row">
                <div className="field filter-search">
                  <label htmlFor="quest-search">Search</label>
                  <input
                    id="quest-search"
                    type="search"
                    placeholder="Title or location"
                    value={filters.query}
                    onChange={(event) => updateFilter({ query: event.target.value })}
                  />
                </div>
                <fieldset className="filter-dates">
                  <legend>When</legend>
                  <div className="chip-row" role="group" aria-label="Date filters">
                    {[
                      { id: "all", label: "Any time" },
                      { id: "today", label: "Today" },
                      { id: "week", label: "This week" },
                      { id: "range", label: "Date range" },
                    ].map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        className={
                          filters.dateFilter === option.id ? "chip chip-active" : "chip"
                        }
                        aria-pressed={filters.dateFilter === option.id}
                        onClick={() => updateFilter({ dateFilter: option.id })}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                  {filters.dateFilter === "range" && (
                    <div className="field-row filter-range">
                      <div className="field">
                        <label htmlFor="quest-from">From</label>
                        <input
                          id="quest-from"
                          type="date"
                          value={filters.from}
                          onChange={(event) => updateFilter({ from: event.target.value })}
                        />
                      </div>
                      <div className="field">
                        <label htmlFor="quest-to">To</label>
                        <input
                          id="quest-to"
                          type="date"
                          value={filters.to}
                          onChange={(event) => updateFilter({ to: event.target.value })}
                        />
                      </div>
                    </div>
                  )}
                </fieldset>
              </div>

              {categories.length > 0 && (
                <div className="chip-row" role="group" aria-label="Categories">
                  <button
                    type="button"
                    className={!filters.category ? "chip chip-active" : "chip"}
                    aria-pressed={!filters.category}
                    onClick={() => updateFilter({ category: "" })}
                  >
                    All categories
                  </button>
                  {categories.map((category) => (
                    <button
                      key={category}
                      type="button"
                      className={filters.category === category ? "chip chip-active" : "chip"}
                      aria-pressed={filters.category === category}
                      onClick={() =>
                        updateFilter({
                          category: filters.category === category ? "" : category,
                        })
                      }
                    >
                      {category}
                    </button>
                  ))}
                </div>
              )}

              <div className="filter-summary">
                <p className="small muted" aria-live="polite">
                  {filtersActive
                    ? `${filtered.length} of ${quests.length} quests match your filters`
                    : `${filtered.length} quest${filtered.length === 1 ? "" : "s"} on the board`}
                </p>
                {filtersActive && (
                  <button type="button" className="link-button small" onClick={clearFilters}>
                    Clear filters
                  </button>
                )}
              </div>
            </section>

            {filtered.length === 0 ? (
              <div className="panel-state muted">
                No quests match these filters. Try another search, category, or date.
              </div>
            ) : (
              <ul className="quest-grid discovery-grid" aria-label="Published quests">
                {filtered.map((quest) => (
                  <QuestCard
                    key={quest.id}
                    quest={quest}
                    joined={joinedIds.includes(quest.id)}
                    onView={openQuest}
                  />
                ))}
              </ul>
            )}
          </>
        )}
        <p className="form-error form-error-left" role="alert">
          {actionError}
        </p>
      </>
    );
  }

  return (
    <div className="page-stack discovery-page">
      <div className="list-toolbar page-header discovery-intro">
        <div>
          <h2 className="screen-title">What&apos;s your next campus adventure?</h2>
          <p className="page-lede">
            Browse the noticeboard for campus activities you can join. Open a quest for the full
            details and join from there.
          </p>
        </div>
        {status === "loaded" && (
          <button type="button" className="button button-secondary button-small" onClick={reload}>
            Reload
          </button>
        )}
      </div>
      {content}
    </div>
  );
}

export default QuestBoard;
