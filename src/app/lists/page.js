import Link from "next/link";
import ListCard from "@/components/lists/ListCard";
import styles from "@/components/lists/Lists.module.css";
import { getRecentPublicLists } from "@/lib/listsData";

export const metadata = {
  title: "Comic lists",
  description: "Collectors' picks, reading orders and must-owns.",
};

export default async function ListsPage() {
  const lists = await getRecentPublicLists();

  return (
    <main className={styles.page}>
      <header className={styles.head}>
        <div>
          <h1>Lists</h1>
          <p className={styles.intro}>
            Collectors&apos; picks, reading orders and must-owns.
          </p>
        </div>
        <Link className={styles.button} href="/lists/new">
          New list
        </Link>
      </header>
      {lists.length ? (
        <section className={styles.grid}>
          {lists.map((list) => (
            <ListCard key={list.id} list={list} />
          ))}
        </section>
      ) : (
        <div className={styles.empty}>No lists yet. Make the first one.</div>
      )}
    </main>
  );
}
