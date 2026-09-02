import { spawn } from "child_process";
import path from "path";

function toDataUri(svg: string): string {
  const encoded = Buffer.from(svg, "utf8").toString("base64");
  return `data:image/svg+xml;base64,${encoded}`;
}

export class PlantUmlRenderer {
  private jarPath: string;
  private graphvizAvailable: Promise<boolean> | undefined;

  constructor(extensionPath: string) {
    this.jarPath = path.join(extensionPath, "vendor", "plantuml.jar");
  }

  async renderToDataUri(source: string): Promise<string> {
    const svg = await this.renderToSvg(source);
    return toDataUri(svg);
  }

  async renderToSvg(source: string): Promise<string> {
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

    return svg;
  }

  /**
   * Diagrams other than sequence diagrams need a layout engine. PlantUML uses a
   * native Graphviz `dot` binary when it can find one and otherwise falls back to
   * its bundled JavaScript Graphviz port, which needs a JS engine that no longer
   * ships with the JDK (Nashorn was removed in Java 15) — so on machines without
   * Graphviz that fallback renders an error image instead of the diagram.
   * Smetana is PlantUML's pure-Java layout engine: no external binary, no JS
   * engine. Prefer native Graphviz for layout quality, fall back to Smetana.
   */
  private isGraphvizAvailable(): Promise<boolean> {
    if (!this.graphvizAvailable) {
      this.graphvizAvailable = this.testDot();
    }
    return this.graphvizAvailable;
  }

  private testDot(): Promise<boolean> {
    return new Promise((resolve) => {
      const proc = spawn("java", [
        "-Djava.awt.headless=true",
        "-jar",
        this.jarPath,
        "-testdot",
      ]);

      const chunks: Uint8Array[] = [];
      proc.stdout.on("data", (chunk) => chunks.push(chunk));
      proc.stderr.on("data", (chunk) => chunks.push(chunk));

      // If Java itself is missing, generate() reports that with a better message.
      proc.on("error", () => resolve(false));
      proc.on("close", () => {
        const output = Buffer.concat(chunks).toString("utf8");
        resolve(output.includes("Installation seems OK"));
      });
    });
  }

  private async generate(source: string): Promise<string> {
    const useSmetana = !(await this.isGraphvizAvailable());

    return new Promise((resolve, reject) => {
      const proc = spawn("java", [
        "-Djava.awt.headless=true",
        "-DPLANTUML_SECURITY_PROFILE=INTERNET",
        "-jar",
        this.jarPath,
        ...(useSmetana ? ["-Playout=smetana"] : []),
        "-pipe",
        "-tsvg",
        "-charset",
        "utf-8",
      ]);

      const stdout: Uint8Array[] = [];
      const stderr: Uint8Array[] = [];

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
