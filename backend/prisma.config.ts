import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  // Allows client generation before the user connects a database.
  datasource: {
    url: process.env.DATABASE_URL || "postgresql://localhost:5432/premier_league",
  },
});
