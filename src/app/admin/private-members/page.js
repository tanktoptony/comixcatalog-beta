"use client";

// Private members, for Tony's own accounts (tanktop__ and test_tony). The
// API (/api/admin/private-members) is the real gate; this check only keeps
// everyone else from seeing an empty shell.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { canSeePrivateMembers } from "@/lib/admin";
import { authedFetch } from "@/lib/apiClient";

const STATUS_LABELS = { owned: "Owned", for_sale: "For sale", wishlist: "Wantlist" };

function day(value) {
  if (!value) return "Never";
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function bookTitle(book) {
  const series = book.series_year ? `${book.series} (${book.series_year})` : book.series;
  return book.issue ? `${series} #${book.issue}` : series;
}

function gradeText(book) {
  if (book.slab && book.grade) return `${book.slab} ${Number(book.grade).toFixed(1)}`;
  if (book.grade) return Number(book.grade).toFixed(1);
  return book.condition || "";
}

export default function PrivateMembersPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [members, setMembers] = useState(null);
  const [error, setError] = useState(null);
  const allowed = Boolean(user && canSeePrivateMembers(user.id));

  useEffect(() => {
    if (loading) return;
    if (!allowed) { router.replace("/"); return; }
    authedFetch("/api/admin/private-members").then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not load private members");
      setMembers(body.members);
    }).catch((err) => setError(err.message));
  }, [loading, allowed, router]);

  if (loading || !allowed) return <main className="admin-shell"><p>Loading...</p></main>;

  return (
    <main className="admin-shell admin-shell-wide">
      <header className="admin-header">
        <p className="admin-kicker">Admin Tools</p>
        <h1 className="admin-title">Private members</h1>
        <p className="admin-lede">Members who set their profile to private. Their profile pages stay hidden from everyone else.</p>
      </header>
      {error && <p className="admin-err">{error}</p>}
      {!members && !error && <p>Loading private members...</p>}
      {members && members.length === 0 && <section className="admin-card"><p>No members are private right now.</p></section>}
      {members?.map((member) => (
        <section className="admin-card" key={member.username}>
          <h2 className="admin-card-title">@{member.username}{member.display_name ? ` (${member.display_name})` : ""}</h2>
          <div className="admin-target-row"><span className="admin-target-label">Joined</span><span className="admin-target-value">{day(member.joined)}</span></div>
          <div className="admin-target-row"><span className="admin-target-label">Last sign-in</span><span className="admin-target-value">{day(member.last_sign_in)}</span></div>
          <div className="admin-target-row"><span className="admin-target-label">Email confirmed</span><span className="admin-target-value">{member.email_confirmed ? "Yes" : "No"}</span></div>
          <div className="admin-target-row"><span className="admin-target-label">Came from</span><span className="admin-target-value">{member.source || "Not recorded"}</span></div>
          <div className="admin-target-row"><span className="admin-target-label">Books</span><span className="admin-target-value">{member.counts.owned} owned · {member.counts.for_sale} for sale · {member.counts.wantlist} on wantlist</span></div>
          {member.books.length === 0 ? (
            <p className="admin-footnote">No books yet.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="admin-table">
                <thead><tr><th>Book</th><th>List</th><th>Grade</th><th>Added</th></tr></thead>
                <tbody>
                  {member.books.map((book) => (
                    <tr key={book.id}>
                      <td style={{ whiteSpace: "normal", minWidth: "12rem" }}>{book.href ? <Link href={book.href}>{bookTitle(book)}</Link> : bookTitle(book)}{book.variant ? ` · ${book.variant}` : ""}</td>
                      <td>{STATUS_LABELS[book.status] ?? book.status}</td>
                      <td>{gradeText(book)}</td>
                      <td>{day(book.added)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ))}
    </main>
  );
}
