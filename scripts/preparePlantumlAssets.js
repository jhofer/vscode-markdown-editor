const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const plantumlRoot = path.join(repoRoot, "node_modules", "node-plantuml");

const copyTargets = [
  {
    source: path.join(plantumlRoot, "vendor"),
    destination: path.join(repoRoot, "vendor"),
  },
  {
    source: path.join(plantumlRoot, "nail"),
    destination: path.join(repoRoot, "nail"),
  },
];

if (!fs.existsSync(plantumlRoot)) {
  throw new Error(
    "node-plantuml is not installed. Run 'npm install' before building."
  );
}

for (const target of copyTargets) {
  if (!fs.existsSync(target.source)) {
    throw new Error(`Missing PlantUML asset directory: ${target.source}`);
  }

  fs.rmSync(target.destination, { recursive: true, force: true });
  fs.cpSync(target.source, target.destination, { recursive: true });
  console.log(`Copied ${target.source} -> ${target.destination}`);
}