import { cp, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";

const source = "github-pages";
const output = "out";

await mkdir(output, { recursive: true });
await cp(source, output, { recursive: true });

if (!existsSync(`${output}/.nojekyll`)) {
  await mkdir(output, { recursive: true });
  await cp(`${source}/.nojekyll`, `${output}/.nojekyll`);
}

console.log("GitHub Pages static site built to ./out");
