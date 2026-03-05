"use client";

import { useEffect, useState } from "react";

export default function ActivityFeed() {
  const [activity, setActivity] = useState([]);

  useEffect(() => {
    async function load() {
      const res = await fetch("/api/activity");
      const data = await res.json();
      setActivity(data.activity || []);
    }

    load();
  }, []);

  return (
    <div className="activity-feed">
      <h3>Recent Collector Activity</h3>

      <div className="activity-ticker">
        <ul>
          {[...activity, ...activity].map((a, i) => (
            <li key={i}>
              <b>{a.profiles?.username || "Collector"}</b>{" "}
              {a.status === "owned" ? "added" : "wishlisted"}{" "}
              {a.comics?.series_title || "Comic"} #{a.comics?.issue_number || ""}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}