"use client";

// Comments under an issue, a list or a review (migration 0114). The first
// paint uses server-rendered data when the page has it, so comment text is
// in the HTML for search; signed-in viewers then refetch to get edit and
// delete rights and to drop members they've blocked.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useId, useState } from "react";
import Avatar from "@/components/Avatar";
import ReportButton from "@/components/ReportButton";
import { useAuth } from "@/context/AuthContext";
import { trackEvent } from "@/lib/analytics";
import { authedFetch } from "@/lib/apiClient";
import { COMMENT_MAX, renderSegments } from "@/lib/comments";
import styles from "./CommentThread.module.css";

const SHOWN_AT_FIRST = 20;
const DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });

function timeAgo(iso) {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const minutes = Math.floor((Date.now() - then) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return DATE.format(new Date(iso));
}

function CommentText({ body, knownUsernames }) {
  return (
    <p className={styles.text}>
      {renderSegments(body, knownUsernames).map((segment, index) =>
        segment.type === "mention" ? (
          <Link key={index} className={styles.mention} href={`/u/${encodeURIComponent(segment.username.toLowerCase())}`}>
            @{segment.username}
          </Link>
        ) : (
          <span key={index}>{segment.text}</span>
        )
      )}
    </p>
  );
}

function Composer({ placeholder, submitLabel, initialValue = "", autoFocus = false, onSubmit, onCancel }) {
  const [body, setBody] = useState(initialValue);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fieldId = useId();
  const tooLong = body.length > COMMENT_MAX;

  async function submit(event) {
    event.preventDefault();
    if (!body.trim() || tooLong) return;
    setBusy(true);
    setError("");
    const result = await onSubmit(body);
    setBusy(false);
    if (result?.error) setError(result.error);
    else if (!initialValue) setBody("");
  }

  return (
    <form className={initialValue ? styles.editBox : styles.composer} onSubmit={submit}>
      <label htmlFor={fieldId} className="sr-only">{placeholder}</label>
      <textarea
        id={fieldId}
        value={body}
        placeholder={placeholder}
        autoFocus={autoFocus}
        rows={3}
        onChange={(event) => setBody(event.target.value)}
      />
      <div className={styles.composerRow}>
        <span className={styles.hint}>
          {body.length >= COMMENT_MAX - 200 ? (
            <span className={`${styles.counter} ${tooLong ? styles.counterOver : ""}`} aria-live="polite">
              {body.length.toLocaleString("en-US")} / 2,000
            </span>
          ) : (
            "Type @ and a username to mention someone."
          )}
        </span>
        <span>
          {onCancel && (
            <button type="button" className={styles.textButton} onClick={onCancel} disabled={busy}>
              Cancel
            </button>
          )}{" "}
          <button type="submit" className={styles.post} disabled={busy || !body.trim() || tooLong}>
            {busy ? "Posting..." : submitLabel}
          </button>
        </span>
      </div>
      {error && <p role="alert" className={styles.error}>{error}</p>}
    </form>
  );
}

function Comment({ comment, knownUsernames, viewerId, canReply, onReply, onEdit, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");

  if (comment.placeholder) {
    return (
      <div className={styles.comment} id={`comment-${comment.id}`}>
        <span aria-hidden="true" />
        <p className={styles.placeholder}>{comment.placeholder === "deleted" ? "Comment deleted" : "Comment hidden"}</p>
      </div>
    );
  }

  const profileHref = `/u/${encodeURIComponent(comment.username)}`;
  const mine = viewerId && String(comment.user_id) === String(viewerId);

  async function remove() {
    setError("");
    const result = await onDelete(comment);
    if (result?.error) setError(result.error);
    setConfirming(false);
  }

  return (
    <div className={styles.comment} id={`comment-${comment.id}`}>
      <span className={styles.avatar}>
        {comment.linkable ? (
          <Link href={profileHref} aria-label={`@${comment.username}`}>
            <Avatar profile={comment} width={36} height={36} />
          </Link>
        ) : (
          <Avatar profile={comment} width={36} height={36} />
        )}
      </span>
      <div className={styles.main}>
        <div className={styles.meta}>
          {comment.linkable ? (
            <Link className={styles.who} href={profileHref}>@{comment.username}</Link>
          ) : (
            <span className={styles.who}>@{comment.username}</span>
          )}
          <time dateTime={comment.created_at} title={new Date(comment.created_at).toLocaleString()}>
            {timeAgo(comment.created_at)}
          </time>
          {comment.edited_at && <span className={styles.edited}>edited</span>}
        </div>

        {editing ? (
          <Composer
            placeholder="Edit your comment"
            submitLabel="Save"
            initialValue={comment.body}
            autoFocus
            onCancel={() => setEditing(false)}
            onSubmit={async (body) => {
              const result = await onEdit(comment, body);
              if (!result?.error) setEditing(false);
              return result;
            }}
          />
        ) : (
          <CommentText body={comment.body} knownUsernames={knownUsernames} />
        )}

        {!editing && (
          <div className={styles.actions}>
            {canReply && viewerId && (
              <button type="button" className={styles.textButton} onClick={() => onReply(comment)}>Reply</button>
            )}
            {comment.canEdit && (
              <button type="button" className={styles.textButton} onClick={() => setEditing(true)}>Edit</button>
            )}
            {comment.canDelete && !confirming && (
              <button type="button" className={styles.textButton} onClick={() => setConfirming(true)}>Delete</button>
            )}
            {confirming && (
              <>
                <span className={styles.hint}>Delete this comment?</span>
                <button type="button" className={`${styles.textButton} ${styles.danger}`} onClick={remove}>Delete</button>
                <button type="button" className={styles.textButton} onClick={() => setConfirming(false)}>Cancel</button>
              </>
            )}
            {!mine && <ReportButton targetType="comment" targetId={comment.id} ownerId={comment.user_id} />}
          </div>
        )}
        {error && <p role="alert" className={styles.error}>{error}</p>}
      </div>
    </div>
  );
}

export default function CommentThread({
  targetType,
  targetId,
  initial = null,
  title = "Comments",
  compact = false,
  id = "comments",
}) {
  const { user, loading: authLoading } = useAuth();
  const pathname = usePathname();
  const [data, setData] = useState(initial);
  const [replyTo, setReplyTo] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const [loadError, setLoadError] = useState("");
  const viewerId = user?.id ?? null;

  const fetchThread = useCallback(async () => {
    const response = await authedFetch(`/api/comments?type=${targetType}&id=${encodeURIComponent(targetId)}`);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || "Could not load comments.");
    return body;
  }, [targetType, targetId]);

  // Signed in: refetch for edit/delete rights and blocks. No server data
  // (review replies): fetch for everyone.
  useEffect(() => {
    if (authLoading) return undefined;
    if (!user && initial) return undefined;
    let cancelled = false;
    fetchThread()
      .then((body) => {
        if (cancelled) return;
        setData(body);
        setLoadError("");
      })
      .catch((error) => {
        if (!cancelled) setLoadError(error.message);
      });
    return () => {
      cancelled = true;
    };
  }, [authLoading, user, initial, fetchThread]);

  // A notification link lands on #comment-<id>: bring it into view once.
  useEffect(() => {
    if (!data || typeof window === "undefined") return undefined;
    const hash = window.location.hash;
    if (!hash.startsWith("#comment-")) return undefined;
    const element = document.getElementById(hash.slice(1));
    if (!element || element.dataset.flashed) return undefined;
    element.dataset.flashed = "1";
    element.scrollIntoView({ block: "center" });
    element.classList.add(styles.flash);
    const timer = window.setTimeout(() => element.classList.remove(styles.flash), 2400);
    return () => window.clearTimeout(timer);
  }, [data]);

  async function send(url, options) {
    const response = await authedFetch(url, { headers: { "Content-Type": "application/json" }, ...options });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) return { error: body.error || "Something went wrong. Try again." };
    const fresh = await fetchThread().catch(() => null);
    if (fresh) setData(fresh);
    return body;
  }

  async function post(body, parentId = null) {
    const result = await send("/api/comments", {
      method: "POST",
      body: JSON.stringify({ target_type: targetType, target_id: String(targetId), parent_id: parentId, body }),
    });
    if (!result.error) {
      trackEvent("comment_posted", { target_type: targetType, reply: Boolean(parentId) });
      setReplyTo(null);
    }
    return result;
  }

  const edit = (comment, body) => send(`/api/comments/${comment.id}`, { method: "PATCH", body: JSON.stringify({ body }) });
  const remove = (comment) => send(`/api/comments/${comment.id}`, { method: "DELETE" });

  const thread = data?.thread ?? [];
  const known = data?.knownUsernames ?? [];
  const count = data?.count ?? 0;
  // Newest conversations matter most once a thread is long: show the last
  // SHOWN_AT_FIRST threads, oldest first, with a button for earlier ones.
  const hidden = showAll ? 0 : Math.max(0, thread.length - SHOWN_AT_FIRST);
  const shown = thread.slice(hidden);
  const Heading = compact ? "h3" : "h2";

  return (
    <section id={id} className={`${styles.section} ${compact ? styles.compact : ""}`}>
      <div className={styles.heading}>
        <Heading>{title}</Heading>
        {!compact && count > 0 && <span>{count} {count === 1 ? "comment" : "comments"}</span>}
      </div>
      <div className={styles.card}>
        {user ? (
          <Composer placeholder={compact ? "Write a reply" : "Add a comment"} submitLabel="Post" onSubmit={(body) => post(body)} />
        ) : (
          !authLoading && (
            <p className={styles.signin}>
              <Link href={`/login?next=${encodeURIComponent(pathname || "/")}`}>Sign in</Link> to join the conversation.
            </p>
          )
        )}

        {!data && !loadError && <div className={styles.skeleton} aria-label="Loading comments" />}
        {loadError && !data && <p role="alert" className={styles.error}>{loadError}</p>}
        {data && thread.length === 0 && (
          <p className={styles.empty}>{compact ? "No replies yet." : "No comments yet. Start the conversation."}</p>
        )}

        {hidden > 0 && (
          <button type="button" className={styles.more} onClick={() => setShowAll(true)}>
            Show {hidden} earlier {hidden === 1 ? "comment" : "comments"}
          </button>
        )}

        {shown.length > 0 && (
          <ol className={styles.list}>
            {shown.map((comment) => (
              <li key={comment.id} className={styles.item}>
                <Comment
                  comment={comment}
                  knownUsernames={known}
                  viewerId={viewerId}
                  canReply={!comment.placeholder}
                  onReply={(target) => setReplyTo(target.id)}
                  onEdit={edit}
                  onDelete={remove}
                />
                {comment.replies?.length > 0 && (
                  <ol className={styles.replies}>
                    {comment.replies.map((reply) => (
                      <li key={reply.id} className={styles.item}>
                        <Comment
                          comment={reply}
                          knownUsernames={known}
                          viewerId={viewerId}
                          canReply={false}
                          onEdit={edit}
                          onDelete={remove}
                        />
                      </li>
                    ))}
                  </ol>
                )}
                {replyTo === comment.id && (
                  <div className={styles.replyComposer}>
                    <Composer
                      placeholder={`Reply to @${comment.username}`}
                      submitLabel="Reply"
                      autoFocus
                      onCancel={() => setReplyTo(null)}
                      onSubmit={(body) => post(body, comment.id)}
                    />
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
