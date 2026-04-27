"use client";

import { useEffect, useMemo, useState } from "react";

export default function ActivityFeed() {
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let ignore = false;

    async function load() {
      try {
        const res = await fetch("/api/activity", {
          cache: "no-store",
          headers: { Accept: "application/json" },
        });

        const text = await res.text();
        const data = text ? JSON.parse(text) : { activity: [] };

        if (!ignore) {
          setActivity(Array.isArray(data?.activity) ? data.activity : []);
        }
      } catch (err) {
        console.error("Failed to load activity:", err);
        if (!ignore) setActivity([]);
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    load();

    return () => {
      ignore = true;
    };
  }, []);

  const shouldScroll = activity.length >= 5;

  const items = useMemo(() => {
    return shouldScroll ? [...activity, ...activity] : activity;
  }, [activity, shouldScroll]);

  return (
    <section className="activity-feed">
      <div className="activity-feed-header">
        <h3 className="activity-feed-title">Recent Collector Activity</h3>
      </div>

      {loading ? (
        <div className="activity-feed-empty">Loading activity…</div>
      ) : activity.length === 0 ? (
        <div className="activity-feed-empty">No recent activity yet.</div>
      ) : (
        <div className={`activity-ticker ${shouldScroll ? "is-scrolling" : "is-static"}`}>
          <ul>
            {items.map((a, i) => {
              const username = a?.profiles?.username || "Collector";
              const status = a?.status === "owned" ? "added" : "wishlisted";
              const title = a?.comics?.series_title || "Unknown comic";
              const issue = a?.comics?.issue_number ? ` #${a.comics.issue_number}` : "";

              return (
                <li key={`${a.user_id}-${a.comic_id}-${a.created_at}-${i}`}>
                  <b>{username}</b> {status} {title}
                  {issue}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}