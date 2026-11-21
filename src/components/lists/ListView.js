"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Avatar from "@/components/Avatar";
import { useAuth } from "@/context/AuthContext";
import { authedFetch } from "@/lib/apiClient";
import { reorder } from "@/lib/lists";
import styles from "./ListPage.module.css";

function formatUpdated(value) {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function mergeServerItems(current, serverItems) {
  const displayByIssue = new Map(
    current.map((item) => [Number(item.base_gcd_issue_id), item])
  );

  return serverItems.map((item) => ({
    ...displayByIssue.get(Number(item.base_gcd_issue_id)),
    ...item,
  }));
}

function HeaderMosaic({ items }) {
  // Real covers only; the blank tiles are for a list with no covers yet, so
  // a 3-book list doesn't look like it is missing a book.
  const covers = items.map((item) => item.cover).filter(Boolean).slice(0, 4);
  const slots = covers.length ? covers.map((_, index) => index) : [0, 1, 2, 3];

  return (
    <div className={styles.mosaic} aria-hidden="true">
      {slots.map((index) =>
        covers[index] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={index}
            className={styles.mosaicCover}
            src={covers[index]}
            alt=""
          />
        ) : (
          <span key={index} className={styles.mosaicEmpty} />
        )
      )}
    </div>
  );
}

function ListEditor({ list, onCancel, onSaved }) {
  const router = useRouter();
  const [title, setTitle] = useState(list.title);
  const [description, setDescription] = useState(list.description ?? "");
  const [isPublic, setIsPublic] = useState(list.is_public);
  const [isRanked, setIsRanked] = useState(list.is_ranked);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setError("");

    const previous = list;
    const optimistic = {
      ...list,
      title: title.trim(),
      description: description.trim() || null,
      is_public: isPublic,
      is_ranked: isRanked,
    };
    onSaved(optimistic, { close: false });

    const response = await authedFetch(`/api/lists/${list.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        description,
        is_public: isPublic,
        is_ranked: isRanked,
      }),
    });
    const body = await response.json();

    if (!response.ok) {
      onSaved(previous, { close: false });
      setError(body.error || "Could not save this list.");
      setSaving(false);
      return;
    }

    onSaved(body.list, { close: true });
    setSaving(false);
    router.refresh();
  }

  return (
    <form className={styles.editForm} onSubmit={save}>
      <label className={styles.fieldLabel}>
        Title
        <input
          className={`${styles.field} ${styles.titleField}`}
          value={title}
          maxLength={100}
          required
          onChange={(event) => setTitle(event.target.value)}
        />
      </label>
      <label className={styles.fieldLabel}>
        Description
        <textarea
          className={styles.textarea}
          value={description}
          maxLength={1000}
          rows={4}
          onChange={(event) => setDescription(event.target.value)}
        />
      </label>
      <div className={styles.toggleRow}>
        <label className={styles.toggleLabel}>
          <input
            type="checkbox"
            checked={isPublic}
            onChange={(event) => setIsPublic(event.target.checked)}
          />
          Public
        </label>
        <label className={styles.toggleLabel}>
          <input
            type="checkbox"
            checked={isRanked}
            onChange={(event) => setIsRanked(event.target.checked)}
          />
          Ranked
        </label>
      </div>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <div className={styles.formActions}>
        <button className={styles.goldButton} disabled={saving}>
          {saving ? "Saving..." : "Save"}
        </button>
        <button
          type="button"
          className={styles.button}
          disabled={saving}
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function ShareDialog({ list }) {
  const dialogRef = useRef(null);
  const [imageUrl, setImageUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    return () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
  }, [imageUrl]);

  async function makeCard() {
    setBusy(true);
    setError("");
    const response = await authedFetch(
      `/api/share-card?type=list&list=${list.id}`
    );

    if (!response.ok) {
      const body = await response.json();
      setError(body.error || "Could not make the share card.");
      setBusy(false);
      return;
    }

    setImageUrl(URL.createObjectURL(await response.blob()));
    setBusy(false);
  }

  return (
    <>
      <button
        type="button"
        className={styles.button}
        onClick={() => dialogRef.current?.showModal()}
      >
        Share image
      </button>
      <dialog ref={dialogRef} className={styles.dialog}>
        {!imageUrl ? (
          <button
            type="button"
            className={styles.goldButton}
            disabled={busy}
            onClick={makeCard}
          >
            {busy ? "Making image..." : "Make share card"}
          </button>
        ) : (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl} alt={`${list.title} share card`} />
            <a
              className={styles.goldButton}
              href={imageUrl}
              download={`${list.slug}.png`}
            >
              Download
            </a>
          </>
        )}
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <form method="dialog">
          <button className={styles.button}>Close</button>
        </form>
      </dialog>
    </>
  );
}

function DeleteList({ list }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function remove() {
    setBusy(true);
    setError("");
    const response = await authedFetch(`/api/lists/${list.id}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      const body = await response.json();
      setError(body.error || "Could not delete this list.");
      setBusy(false);
      return;
    }

    router.push(`/u/${list.username}/lists`);
  }

  if (!confirming) {
    return (
      <button
        type="button"
        className={styles.dangerButton}
        onClick={() => setConfirming(true)}
      >
        Delete list
      </button>
    );
  }

  return (
    <div className={styles.confirm}>
      <strong>Delete this list? This can&apos;t be undone.</strong>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <div className={styles.confirmActions}>
        <button
          type="button"
          className={styles.dangerButton}
          disabled={busy}
          onClick={remove}
        >
          {busy ? "Deleting..." : "Delete"}
        </button>
        <button
          type="button"
          className={styles.button}
          disabled={busy}
          onClick={() => setConfirming(false)}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function AddBooks({ listId, items, onAdded }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [busyIssue, setBusyIssue] = useState(null);
  const addedIds = new Set(items.map((item) => Number(item.base_gcd_issue_id)));
  const tooShort = query.trim().length < 2;
  const visibleResults = tooShort ? [] : results;
  const searching = !tooShort && loading;

  useEffect(() => {
    const trimmed = query.trim();
    // Under 2 characters nothing is fetched; the render hides old results.
    if (trimmed.length < 2) return undefined;

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const response = await authedFetch(
          `/api/search/comics?q=${encodeURIComponent(trimmed)}&limit=12`,
          { signal: controller.signal }
        );
        const body = await response.json();
        if (!response.ok) throw new Error("Search failed");
        setResults(
          (body.comics ?? []).filter((row) =>
            String(row.id).startsWith("gcd-")
          )
        );
      } catch (searchError) {
        if (searchError.name !== "AbortError") {
          setError("Could not search right now.");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 300);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  async function add(row) {
    const requestedIssueId = Number(String(row.id).replace(/^gcd-/, ""));
    setBusyIssue(requestedIssueId);
    setError("");

    const optimistic = {
      list_id: listId,
      base_gcd_issue_id: requestedIssueId,
      position: items.length,
      note: null,
      title: `${row.series_title} #${row.issue_number}`,
      series_title: row.series_title,
      issue_number: row.issue_number,
      year: row.release_year,
      cover: row.cover_path,
      href: `/issue/gcd-${requestedIssueId}`,
    };
    onAdded(optimistic, { pending: true });

    const response = await authedFetch(`/api/lists/${listId}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ issue: requestedIssueId }),
    });
    const body = await response.json();

    if (!response.ok) {
      onAdded(optimistic, { rollback: true });
      setError(body.error || "Could not add that book.");
      setBusyIssue(null);
      return;
    }

    onAdded({ ...optimistic, ...body.item }, { pending: false });
    setBusyIssue(null);
  }

  return (
    <section className={styles.ownerPanel}>
      <div className={styles.searchHead}>
        <strong>Add books</strong>
        <span className={styles.searchStatus}>
          {searching ? "Searching..." : query.trim().length < 2 ? "Type 2 or more characters" : ""}
        </span>
      </div>
      <input
        className={styles.searchInput}
        value={query}
        placeholder="Search by series and issue number"
        aria-label="Search comics to add"
        onChange={(event) => setQuery(event.target.value)}
      />
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {visibleResults.length > 0 && (
        <div className={styles.results}>
          {visibleResults.map((row) => {
            const issueId = Number(String(row.id).replace(/^gcd-/, ""));
            const added = addedIds.has(issueId);
            return (
              <div className={styles.result} key={row.id}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={row.cover_path || "/fallback-cover.png"} alt="" />
                <span className={styles.resultTitle}>
                  {row.series_title} #{row.issue_number}
                  {row.release_year ? ` (${row.release_year})` : ""}
                </span>
                <button
                  type="button"
                  className={added ? styles.button : styles.goldButton}
                  disabled={added || busyIssue === issueId}
                  onClick={() => add(row)}
                >
                  {added ? "Added" : busyIssue === issueId ? "Adding..." : "Add"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function ItemOwnerTools({ item, index, total, onNote, onMove, onRemove }) {
  const [editingNote, setEditingNote] = useState(false);
  const [note, setNote] = useState(item.note ?? "");
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function saveNote() {
    setBusy(true);
    setError("");
    const result = await onNote(item, note);
    if (result?.error) setError(result.error);
    else setEditingNote(false);
    setBusy(false);
  }

  async function remove() {
    setBusy(true);
    const result = await onRemove(item);
    if (result?.error) {
      setError(result.error);
      setBusy(false);
    }
  }

  return (
    <div className={styles.itemTools}>
      {editingNote ? (
        <>
          <textarea
            className={styles.textarea}
            value={note}
            maxLength={500}
            rows={4}
            placeholder="Why does this book belong here?"
            onChange={(event) => setNote(event.target.value)}
          />
          <span className={styles.counter}>{note.length} / 500</span>
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          <div className={styles.itemActions}>
            <button
              type="button"
              className={styles.goldButton}
              disabled={busy}
              onClick={saveNote}
            >
              {busy ? "Saving..." : "Save"}
            </button>
            <button
              type="button"
              className={styles.button}
              disabled={busy}
              onClick={() => {
                setNote(item.note ?? "");
                setEditingNote(false);
                setError("");
              }}
            >
              Cancel
            </button>
          </div>
        </>
      ) : (
        <button
          type="button"
          className={styles.textButton}
          onClick={() => {
            setNote(item.note ?? "");
            setEditingNote(true);
          }}
        >
          {item.note ? "Edit note" : "Add note"}
        </button>
      )}
      <div className={styles.itemActions}>
        <button
          type="button"
          className={styles.button}
          disabled={index === 0 || busy}
          onClick={() => onMove(item, index - 1)}
        >
          Move up
        </button>
        <button
          type="button"
          className={styles.button}
          disabled={index === total - 1 || busy}
          onClick={() => onMove(item, index + 1)}
        >
          Move down
        </button>
        {!confirmingRemove && (
          <button
            type="button"
            className={styles.dangerButton}
            onClick={() => setConfirmingRemove(true)}
          >
            Remove
          </button>
        )}
      </div>
      {confirmingRemove && (
        <div className={styles.confirm}>
          <span>Remove this book from the list?</span>
          <div className={styles.confirmActions}>
            <button
              type="button"
              className={styles.dangerButton}
              disabled={busy}
              onClick={remove}
            >
              {busy ? "Removing..." : "Remove"}
            </button>
            <button
              type="button"
              className={styles.button}
              disabled={busy}
              onClick={() => setConfirmingRemove(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ListView({ initialData }) {
  const { user } = useAuth();
  const [list, setList] = useState({
    ...initialData.list,
    username: initialData.owner.username,
  });
  const [items, setItems] = useState(initialData.items);
  const [editing, setEditing] = useState(false);
  const [rowsView, setRowsView] = useState(false);
  const [mutationError, setMutationError] = useState("");
  const owner = initialData.owner;
  const isOwner = user?.id === owner.id;

  function setSavedList(next, { close }) {
    setList((current) => ({ ...current, ...next }));
    if (close) setEditing(false);
  }

  function handleAdded(item, options) {
    if (options.rollback) {
      setItems((current) =>
        current.filter(
          (row) =>
            Number(row.base_gcd_issue_id) !== Number(item.base_gcd_issue_id)
        )
      );
      return;
    }

    setItems((current) => {
      const without = current.filter(
        (row) =>
          Number(row.base_gcd_issue_id) !== Number(item.base_gcd_issue_id)
      );
      return [...without, item].map((row, position) => ({ ...row, position }));
    });
  }

  async function saveNote(item, note) {
    setMutationError("");
    const previous = items;
    setItems((current) =>
      current.map((row) =>
        row.base_gcd_issue_id === item.base_gcd_issue_id
          ? { ...row, note: note.trim() || null }
          : row
      )
    );

    const response = await authedFetch(`/api/lists/${list.id}/items`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ issue: item.base_gcd_issue_id, note }),
    });
    const body = await response.json();

    if (!response.ok) {
      setItems(previous);
      return { error: body.error || "Could not save the note." };
    }

    setItems((current) => mergeServerItems(current, body.items));
    return {};
  }

  async function moveItem(item, toIndex) {
    setMutationError("");
    const previous = items;
    setItems(reorder(items, item.base_gcd_issue_id, toIndex));

    const response = await authedFetch(`/api/lists/${list.id}/items`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ issue: item.base_gcd_issue_id, toIndex }),
    });
    const body = await response.json();

    if (!response.ok) {
      setItems(previous);
      setMutationError(body.error || "Could not move that book.");
      return;
    }

    setItems((current) => mergeServerItems(current, body.items));
  }

  async function removeItem(item) {
    setMutationError("");
    const previous = items;
    setItems((current) =>
      current
        .filter(
          (row) =>
            Number(row.base_gcd_issue_id) !== Number(item.base_gcd_issue_id)
        )
        .map((row, position) => ({ ...row, position }))
    );

    const response = await authedFetch(
      `/api/lists/${list.id}/items?issue=${item.base_gcd_issue_id}`,
      { method: "DELETE" }
    );
    const body = await response.json();

    if (!response.ok) {
      setItems(previous);
      return { error: body.error || "Could not remove that book." };
    }

    setItems((current) => mergeServerItems(current, body.items));
    return {};
  }

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.heroCopy}>
          <div className={styles.byline}>
            <Avatar profile={owner} width={34} />
            <span>A list by @{owner.username}</span>
          </div>
          {editing ? (
            <ListEditor
              list={list}
              onCancel={() => setEditing(false)}
              onSaved={setSavedList}
            />
          ) : (
            <>
              <h1 className={styles.title}>{list.title}</h1>
              {list.description && (
                <p className={styles.description}>{list.description}</p>
              )}
              <div className={styles.meta}>
                {items.length} book{items.length === 1 ? "" : "s"} · Updated{" "}
                {formatUpdated(list.updated_at)}
                {!list.is_public && " · Private"}
              </div>
              <div className={styles.toolbar}>
                <button
                  type="button"
                  className={styles.button}
                  onClick={() => setRowsView((value) => !value)}
                >
                  {rowsView ? "Grid view" : "Rows view"}
                </button>
                {isOwner && (
                  <>
                    <button
                      type="button"
                      className={styles.button}
                      onClick={() => setEditing(true)}
                    >
                      Edit list
                    </button>
                    <ShareDialog list={list} />
                    <DeleteList list={list} />
                  </>
                )}
              </div>
            </>
          )}
        </div>
        <HeaderMosaic items={items} />
      </header>

      {isOwner && <AddBooks listId={list.id} items={items} onAdded={handleAdded} />}
      {mutationError && (
        <p className={styles.error} role="alert">
          {mutationError}
        </p>
      )}

      {items.length > 0 ? (
        <section className={rowsView ? styles.rows : styles.grid}>
          {items.map((item, index) => (
            <article className={styles.card} key={item.base_gcd_issue_id}>
              <div className={styles.coverWrap}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className={styles.cover}
                  src={item.cover || "/fallback-cover.png"}
                  alt=""
                />
                {list.is_ranked && (
                  <span className={styles.rank}>{index + 1}</span>
                )}
              </div>
              <Link className={styles.name} href={item.href}>
                {item.title}{" "}
                {item.year && <span className={styles.year}>({item.year})</span>}
              </Link>
              {item.note && (
                <blockquote className={styles.note}>{item.note}</blockquote>
              )}
              {isOwner && (
                <ItemOwnerTools
                  item={item}
                  index={index}
                  total={items.length}
                  onNote={saveNote}
                  onMove={moveItem}
                  onRemove={removeItem}
                />
              )}
            </article>
          ))}
        </section>
      ) : (
        <div className={styles.empty}>
          {isOwner
            ? "This list is ready for its first book. Search above to add one."
            : "No books have been added to this list yet."}
        </div>
      )}
    </main>
  );
}
