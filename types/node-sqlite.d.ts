// Types for the parts of Node's built-in SQLite (Node 22.5+) this app uses. @types/node 20 predates it.
declare module "node:sqlite" {
  type Value = null | number | bigint | string | Uint8Array;
  export class StatementSync {
    run(...params: Value[]): { changes: number | bigint; lastInsertRowid: number | bigint };
    get(...params: Value[]): Record<string, Value> | undefined;
    all(...params: Value[]): Record<string, Value>[];
  }
  export class DatabaseSync {
    constructor(path: string, options?: { open?: boolean; readOnly?: boolean });
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
    close(): void;
  }
}
