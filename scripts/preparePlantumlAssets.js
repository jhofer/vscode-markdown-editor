const fs = require("fs");
const https = require("https");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const vendorDir = path.join(repoRoot, "vendor");
const jarPath = path.join(vendorDir, "plantuml.jar");
const tempJarPath = path.join(vendorDir, "plantuml.jar.download");

// PlantUML v1.2024.8 – the last release that supports Java 8.
// Later versions require Java 11+.
// To use the latest PlantUML, install Java 11+ and change this to:
//   https://github.com/plantuml/plantuml/releases/latest/download/plantuml.jar
const PLANTUML_JAR_URL =
  "https://github.com/plantuml/plantuml/releases/download/v1.2024.8/plantuml-1.2024.8.jar";

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, (response) => {
      // Follow redirects (GitHub redirects to a CDN)
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        download(response.headers.location, dest).then(resolve, reject);
        return;
      }

      if (response.statusCode !== 200) {
        reject(new Error(`Download failed with status ${response.statusCode}`));
        return;
      }

      const file = fs.createWriteStream(dest);
      response.pipe(file);
      file.on("finish", () => {
        file.close(resolve);
      });
      file.on("error", (err) => {
        fs.unlinkSync(dest);
        reject(err);
      });
    });

    request.on("error", reject);
  });
}

async function main() {
  // Create vendor directory if it doesn't exist
  fs.mkdirSync(vendorDir, { recursive: true });

  // Remove old nail directory if it exists (no longer needed)
  const nailDir = path.join(repoRoot, "nail");
  if (fs.existsSync(nailDir)) {
    fs.rmSync(nailDir, { recursive: true, force: true });
    console.log("Removed obsolete nail/ directory");
  }

  // Always refresh to the pinned version so marketplace builds cannot accidentally
  // ship an older stale JAR from a previous release.
  if (fs.existsSync(tempJarPath)) {
    fs.rmSync(tempJarPath, { force: true });
  }

  console.log(`Downloading PlantUML JAR from ${PLANTUML_JAR_URL}...`);
  await download(PLANTUML_JAR_URL, tempJarPath);

  // Atomically replace the target as best-effort on each platform.
  fs.rmSync(jarPath, { force: true });
  fs.renameSync(tempJarPath, jarPath);

  console.log(`Prepared PlantUML JAR at ${jarPath}`);
}

main().catch((err) => {
  console.error("Failed to prepare PlantUML assets:", err);
  process.exit(1);
});