import Link from "next/link";
import { notFound } from "next/navigation";

export default async function PublicProfilePage({ params }) {
  // Next 16 requires awaiting params
  const resolvedParams = await params;
  const username = resolvedParams?.username;

  if (!username) {
    notFound();
  }

  const res = await fetch(
    `http://localhost:3000/api/public-profile?username=${username}`,
    { cache: "no-store" }
  );

  if (!res.ok) {
    notFound();
  }

  const { collection } = await res.json();

  return (
    <main style={{ padding: "2rem" }}>
      <h1>{username}&apos;s Collection</h1>
      <p>Total Books: {collection.length}</p>

      <div className="comic-grid">
        {collection.map((item) => {
        const comic = item.comics;
        if (!comic) return null;

        // safely determine cover
        const primaryCover =
            comic.comic_covers?.find((c) => c.is_primary) ||
            comic.comic_covers?.[0];

        const coverUrl = primaryCover
            ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/comic-covers/${primaryCover.image_path}`
            : "/fallback-cover.png";

        return (
            <Link
            key={item.id}
            href={`/comic/${comic.id}`}
            className="comic-card"
            >
            <div className="comic-card-cover">
                <img
                src={coverUrl}
                alt={comic.series_title}
                />
            </div>

      <div className="comic-card-title">
        {comic.series_title}
        {comic.issue_number ? ` #${comic.issue_number}` : ""}
      </div>

      <div className="comic-card-meta">
        {comic.release_year || "Unknown"}
      </div>
    </Link>
  );
})}
      </div>
    </main>
  );
}