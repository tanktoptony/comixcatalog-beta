// /lib/search/localSQLite.js

import initSqlJs from "sql.js";

let db = null;

async function loadDatabase() {
  if (db) return db;

  const SQL = await initSqlJs({
    locateFile: () => "/sql-wasm.wasm",
  });

  const buffer = await fetch("/data/gcd-lite.sqlite").then((r) =>
    r.arrayBuffer()
  );
  db = new SQL.Database(new Uint8Array(buffer));

  return db;
}

export async function localSearch(query) {
  const database = await loadDatabase();

  // Basic query for C1 fields
  const stmt = database.prepare(`
    SELECT 
      id,
      title,
      series,
      issue_number,
      year,
      cover_url,
      publisher,
      creator
    FROM issues
    WHERE title LIKE $pattern OR series LIKE $pattern
    LIMIT 60;
  `);

  const results = [];
  stmt.bind({ $pattern: `%${query}%` });

  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }

  stmt.free();

  return results;
}
