// Prisma 7 configuration — replaces the `url` in schema.prisma
// See: https://pris.ly/d/prisma7-config
import path from "node:path";
import { defineConfig } from "prisma/config";

const dbPath = process.env.DATABASE_URL?.replace(/^file:/, "") ?? path.join(process.cwd(), "db", "custom.db");

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  datasource: {
    url: `file:${dbPath}`,
  },
});
