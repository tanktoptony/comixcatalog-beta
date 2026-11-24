import styles from "@/components/lists/Lists.module.css";

export default function Loading() {
  return (
    <main className={styles.page} aria-label="Loading lists">
      <header className={styles.head}>
        <div>
          <h1>Lists</h1>
          <p className={styles.intro}>Loading collector lists...</p>
        </div>
      </header>
      <div className={styles.skeletonGrid}>
        {[0, 1, 2, 3, 4, 5].map((index) => (
          <div key={index} className={styles.skeleton} />
        ))}
      </div>
    </main>
  );
}
