import { formatTimeWindow } from "./format.js";
import { bannerClassName, truncateText } from "./questBanners.js";

function QuestCard({ quest, joined = false, onView, actionLabel = "View quest" }) {
  return (
    <li className="quest-card discovery-card">
      <div className={bannerClassName(quest.category)} aria-hidden="true">
        <span className="quest-banner-stamp">Quest</span>
      </div>
      <div className="quest-card-body">
        <div className="quest-card-meta">
          <span className="badge badge-category">{quest.category || "Campus"}</span>
          <span className="badge badge-points">{quest.points ?? "—"} pts</span>
          {joined && <span className="badge badge-joined">Joined</span>}
        </div>
        <h3 className="quest-card-title">{quest.title}</h3>
        <p className="small muted quest-card-when">{formatTimeWindow(quest.startsAt, quest.endsAt)}</p>
        <p className="small muted quest-card-where">{quest.location}</p>
        <p className="quest-card-blurb">{truncateText(quest.description)}</p>
        <div className="request-actions">
          <button
            type="button"
            className="button button-secondary button-small"
            onClick={() => onView(quest.id)}
            aria-label={`${actionLabel}: ${quest.title}`}
          >
            {actionLabel}
          </button>
        </div>
      </div>
    </li>
  );
}

export default QuestCard;
