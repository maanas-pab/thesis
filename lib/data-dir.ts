import path from "node:path";

/** Where everything the server keeps lives. Point DATA_DIR at a persistent volume in production. */
export const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), ".data");
