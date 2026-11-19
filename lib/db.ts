import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { DATA_DIR } from "./data-dir";

/**
 * One SQLite file for users, sessions and accounts. It's built into Node, so there's no database
 * server to run. Lives in DATA_DIR, which must be on a persistent disk in production.
 */
const g = globalThis as unknown as { __db?: DatabaseSync };

const MIGRATIONS = [
  `create table users (
     id text primary key,
     email text not null unique collate nocase,
     password text not null,
     created_at integer not null
   );
   create table sessions (
     token_hash text primary key,
     user_id text not null references users(id) on delete cascade,
     created_at integer not null,
     expires_at integer not null
   );
   create index sessions_user on sessions(user_id);
   create table accounts (
     user_id text primary key references users(id) on delete cascade,
     doc text not null,
     version integer not null default 1,
     updated_at integer not null
   );`,
];

export function db() {
  if (g.__db) return g.__db;
  mkdirSync(DATA_DIR, { recursive: true });
  const d = new DatabaseSync(path.join(DATA_DIR, "thesis.db"));
  d.exec("pragma journal_mode = wal; pragma foreign_keys = on; pragma busy_timeout = 5000;");
  const { user_version: at } = d.prepare("pragma user_version").get() as { user_version: number };
  for (let i = at; i < MIGRATIONS.length; i++) {
    d.exec("begin");
    try {
      d.exec(MIGRATIONS[i]);
      d.exec(`pragma user_version = ${i + 1}`);
      d.exec("commit");
    } catch (e) {
      d.exec("rollback");
      throw e;
    }
  }
  return (g.__db = d);
}
