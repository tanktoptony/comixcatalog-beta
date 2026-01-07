// src/lib/db.js

let dbPromise = null;

export async function loadDatabase() {
  if (typeof window === "undefined") {
    throw new Error("Server execution blocked");
  }

  if (dbPromise) return dbPromise;

  if (!window.initSqlJs) {
    throw new Error("sql.js not loaded yet");
  }

  const SQL = await window.initSqlJs({
    locateFile: () => "/sqljs/sql-wasm.wasm",
  });

  const response = await fetch("/data/gcd-lite.sqlite");
  const buffer = await response.arrayBuffer();

  const db = new SQL.Database(new Uint8Array(buffer));
  dbPromise = db;

  return db;
}
