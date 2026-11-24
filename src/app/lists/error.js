"use client";

import styles from "@/components/lists/Lists.module.css";

export default function ErrorState({ reset }) {
  return (
    <main className={styles.page}>
      <div className={styles.empty}>
        <span>Lists could not be loaded.</span>
        <button className={styles.button} onClick={reset}>
          Try again
        </button>
      </div>
    </main>
  );
}
