"use client";

// Activity, New followers and Pending purchases: shown above the list on
// phones and in the empty right pane on desktop.

import Link from "next/link";
import Avatar from "@/components/Avatar";
import FollowButton from "@/components/FollowButton";
import { notificationSentence } from "@/lib/comments";
import { formatTimeAgo } from "@/lib/timeAgo";

// Replies, mentions and comments on your lists and reviews. Unread ones
// carry a gold dot; opening the inbox marks them read for next time.
export function ActivityStrip({ items }) {
  if (!items?.length) return null;
  return (
    <section className="inbox-followers inbox-activity" aria-labelledby="inbox-activity-heading">
      <div className="inbox-followers-heading">
        <h2 id="inbox-activity-heading">Activity</h2>
      </div>
      <ul className="inbox-activity-list">
        {items.map((item) => (
          <li key={item.id} className={`inbox-activity-item${item.read_at ? "" : " is-unread"}`}>
            <Link href={item.url} className="inbox-activity-link">
              <span className="inbox-activity-avatar">
                <Avatar profile={item.actor || { id: item.actor_id, username: "?" }} />
              </span>
              <span className="inbox-activity-body">
                <strong>{notificationSentence({ kind: item.kind, actor: item.actor?.username, label: item.label })}</strong>
                {item.excerpt && <small>&ldquo;{item.excerpt}&rdquo;</small>}
              </span>
              <span className="inbox-thread-time">{formatTimeAgo(item.created_at)}</span>
              {!item.read_at && <span className="inbox-thread-unread-dot" aria-label="New" />}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function NewFollowersStrip({ followers }) {
  if (!followers?.length) return null;
  return (
    <section className="inbox-followers" aria-labelledby="new-followers-heading">
      <div className="inbox-followers-heading">
        <h2 id="new-followers-heading">New followers</h2>
        <Link href="/people?tab=followers">See all</Link>
      </div>
      <div className="inbox-followers-list">
        {followers.map((follower) => (
          <article className="inbox-follower" key={follower.id}>
            <Link href={`/u/${follower.username}`} className="inbox-follower-person">
              <Avatar profile={follower} />
              <span><strong>{follower.display_name || follower.username}</strong><small>@{follower.username}</small></span>
            </Link>
            <FollowButton username={follower.username} ownerId={follower.id} initialFollowing={follower.following} compact />
          </article>
        ))}
      </div>
    </section>
  );
}

/* Pending purchase covers can be seller-hosted URLs outside Next Image's configured hosts. */
export function PendingPurchasesStrip({ purchases }) {
  if (!purchases?.length) return null;
  return (
    <section className="inbox-followers inbox-purchases" aria-labelledby="pending-purchases-heading">
      <div className="inbox-followers-heading"><h2 id="pending-purchases-heading">Pending purchases</h2></div>
      <div className="inbox-followers-list">
        {purchases.map((purchase) => {
          const title = `${purchase.series_title}${purchase.issue_number ? ` #${purchase.issue_number}` : ""}`;
          return (
            <article className="inbox-purchase" key={purchase.id}>
              <div className="inbox-purchase-cover">
                {purchase.user_cover_url
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={purchase.user_cover_url} alt="" />
                  : <span aria-hidden="true">CC</span>}
              </div>
              <div className="inbox-purchase-copy">
                <strong>{title}</strong>
                <small>{new Intl.NumberFormat("en-US", { style: "currency", currency: purchase.currency || "USD" }).format(Number(purchase.sale_price))} · from @{purchase.seller_username}</small>
              </div>
              <Link className="inbox-purchase-review" href={`/purchases/${purchase.id}`} aria-label={`Review ${title}`}>Review</Link>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export default function InboxStrips({ activity, newFollowers, pendingPurchases }) {
  return (
    <>
      <ActivityStrip items={activity} />
      <NewFollowersStrip followers={newFollowers} />
      <PendingPurchasesStrip purchases={pendingPurchases} />
    </>
  );
}
