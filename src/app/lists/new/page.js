import NewListForm from "@/components/lists/NewListForm";
import styles from "@/components/lists/Lists.module.css";

export const metadata = { title: "New comic list" };

export default function NewListPage() {
  return (
    <main className={styles.page}>
      <header className={styles.head}>
        <div>
          <h1>New list</h1>
          <p className={styles.intro}>
            Build a reading order, ranked shelf or set of must-owns.
          </p>
        </div>
      </header>
      <NewListForm />
    </main>
  );
}
