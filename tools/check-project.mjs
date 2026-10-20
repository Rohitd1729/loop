import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const required = [
  "index.html",
  "css/style.css",
  "js/content.js",
  "js/main.js",
  "js/globe.js",
  "js/globe-transition.js",
  "js/world3d.js",
  "content/updates.json",
  "assets/globe-countries.json"
];

const fail = (message) => {
  console.error(`CHECK FAILED: ${message}`);
  process.exitCode = 1;
};

for (const file of required) {
  if (!existsSync(join(root, file))) fail(`missing ${file}`);
}

const jsFiles = [
  "js/content.js",
  "js/main.js",
  "js/globe.js",
  "js/globe-transition.js",
  "js/world3d.js"
];

for (const file of jsFiles) {
  const result = spawnSync(process.execPath, ["--check", join(root, file)], { encoding: "utf8" });
  if (result.status !== 0) {
    fail(`${file} has invalid JavaScript`);
    if (result.stderr) process.stderr.write(result.stderr);
  }
}

for (const file of ["content/updates.json", "assets/globe-countries.json"]) {
  try {
    JSON.parse(readFileSync(join(root, file), "utf8"));
  } catch (error) {
    fail(`${file} is not valid JSON: ${error.message}`);
  }
}

if (!process.exitCode) {
  console.log(`OK: checked ${jsFiles.length} JavaScript files and 2 JSON files`);
}
