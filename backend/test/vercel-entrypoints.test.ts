import { access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

const backendRoot = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return false;
    }
    throw error;
  }
}

describe("Vercel Express entrypoints", () => {
  it("keeps one auto-detected deploy entrypoint", async () => {
    const candidates = [
      "app.ts",
      "index.ts",
      "server.ts",
      "src/app.ts",
      "src/index.ts",
      "src/server.ts",
    ];
    const existing = (
      await Promise.all(
        candidates.map(async (candidate) => ({
          candidate,
          exists: await fileExists(join(backendRoot, candidate)),
        })),
      )
    )
      .filter(({ exists }) => exists)
      .map(({ candidate }) => candidate);

    expect(existing).toEqual(["src/index.ts"]);
  });
});
