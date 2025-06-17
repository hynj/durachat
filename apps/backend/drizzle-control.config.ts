import { defineConfig } from "drizzle-kit";
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/control/",
  out: "./drizzle/control",
});
