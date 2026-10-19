import { readFile } from "node:fs/promises";
import { join } from "node:path";

let promise;
export function ogFonts() {
  promise ??= Promise.all(
    [
      ["Big Shoulders", "BigShoulders-800.ttf", 800],
      ["Inter", "Inter-400.ttf", 400],
      ["Inter", "Inter-600.ttf", 600],
      ["Inter", "Inter-800.ttf", 800],
    ].map(async ([name, file, weight]) => ({
      name,
      data: await readFile(join(process.cwd(), "src/assets/og-fonts", file)),
      weight,
      style: "normal",
    })),
  );
  promise.catch(() => {
    promise = undefined;
  });
  return promise;
}
