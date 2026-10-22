import Link from "next/link";

function Note({ pick }) {
  if (!pick.noteLink || !pick.noteLinkHref) return pick.note;

  const [before, after] = pick.note.split(pick.noteLink.text);
  return (
    <>
      {before}
      <Link href={pick.noteLinkHref}>{pick.noteLink.text}</Link>
      {after}
    </>
  );
}

function CoverCard({ pick, eager }) {
  if (pick.status) {
    return (
      <div className="excited-status-art">
        <span className="excited-status-pill">{pick.status}</span>
        <strong>{pick.title}</strong>
        <div className="excited-creators">
          {pick.creators.map((creator, index) => (
            <span key={creator.slug}>
              {index > 0 ? " + " : null}
              <Link href={`/creator/${creator.slug}`}>{creator.name}</Link>
            </span>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={`excited-covers${pick.series.length > 1 ? " is-fan" : ""}`}>
      {pick.series.map((series) => (
        <Link
          href={`/series/${series.id}`}
          className="excited-cover-link"
          key={series.id}
          aria-label={`View ${series.title}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={series.cover}
            alt={`${series.title} cover`}
            loading={eager ? "eager" : "lazy"}
          />
        </Link>
      ))}
    </div>
  );
}

export default function ExcitedStrip({ picks = [] }) {
  if (picks.length < 3) return null;

  return (
    <section className="excited-section" aria-labelledby="excited-heading">
      <h2 id="excited-heading">What we&rsquo;re excited about</h2>
      <div className="excited-grid">
        {picks.map((pick, index) => (
          <article className="excited-card" key={pick.key}>
            <CoverCard pick={pick} eager={index < 3} />
            <div className="excited-copy">
              <p className="excited-label">{pick.label}</p>
              <h3>{pick.title}</h3>
              <p className="excited-note">
                <Note pick={pick} />
              </p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
