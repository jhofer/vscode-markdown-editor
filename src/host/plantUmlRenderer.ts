import { spawn } from "child_process";
import path from "path";

function toDataUri(svg: string): string {
  const encoded = Buffer.from(svg, "utf8").toString("base64");
  return `data:image/svg+xml;base64,${encoded}`;
}

export class PlantUmlRenderer {
  private jarPath: string;

  constructor(extensionPath: string) {
    this.jarPath = path.join(extensionPath, "vendor", "plantuml.jar");
  }

  async renderToDataUri(source: string): Promise<string> {
    const trimmed = source.trim();
    if (!trimmed) {
      throw new Error("PlantUML source is empty");
    }

    const normalized = trimmed.startsWith("@startuml")
      ? trimmed
      : `@startuml\n${trimmed}\n@enduml`;

    const svg = await this.generate(normalized);

    if (!svg.trim()) {
      throw new Error("PlantUML did not produce SVG output");
    }

    return toDataUri(svg);
  }

  private generate(source: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = spawn("java", [
        "-Djava.awt.headless=true",
        "-DPLANTUML_SECURITY_PROFILE=INTERNET",
        "-jar",
        this.jarPath,
        "-pipe",
        "-tsvg",
        "-charset",
        "utf-8",
      ]);

      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];

      proc.stdout.on("data", (chunk) => stdout.push(chunk));
      proc.stderr.on("data", (chunk) => stderr.push(chunk));

      proc.on("error", (err) => {
        reject(
          new Error(
            `Failed to start Java process. Is Java installed and in PATH? ${err.message}`
          )
        );
      });

      proc.on("close", (code) => {
        const output = Buffer.concat(stdout).toString("utf8");
        if (code !== 0) {
          const errOutput = Buffer.concat(stderr).toString("utf8");
          if (errOutput.includes("UnsupportedClassVersionError")) {
            reject(
              new Error(
                "PlantUML requires a newer Java version. Please install Java 11 or later."
              )
            );
          } else {
            reject(
              new Error(`PlantUML exited with code ${code}: ${errOutput}`)
            );
          }
        } else {
          resolve(output);
        }
      });

      proc.stdin.write(source);
      proc.stdin.end();
    });
  }
}
