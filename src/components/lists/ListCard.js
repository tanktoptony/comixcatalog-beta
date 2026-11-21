import Link from "next/link";
import styles from "./ListCard.module.css";

export default function ListCard({ list, username = list.owner?.username }) {
  return (
    <Link
      className={styles.card}
      href={`/u/${encodeURIComponent(username)}/lists/${encodeURIComponent(list.slug)}`}
    >
      <span className={styles.covers} aria-hidden="true">
        {[0, 1, 2, 3].map((index) =>
          list.covers?.[index] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={index} src={list.covers[index]} alt="" />
          ) : (
            <span key={index} className={styles.placeholder} />
          )
        )}
      </span>
      <strong className={styles.title}>{list.title}</strong>
      <span className={styles.meta}>
        {list.item_count} book{list.item_count === 1 ? "" : "s"}
        {list.is_public === false && (
          <span className={styles.private}>Private</span>
        )}
      </span>
    </Link>
  );
}
