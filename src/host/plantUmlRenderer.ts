import plantuml from "node-plantuml";

function toDataUri(svg: string): string {
  const encoded = Buffer.from(svg, "utf8").toString("base64");
  return `data:image/svg+xml;base64,${encoded}`;
}

export class PlantUmlRenderer {
  async renderToDataUri(source: string): Promise<string> {
    const trimmed = source.trim();
    if (!trimmed) {
      throw new Error("PlantUML source is empty");
    }

    const normalized = trimmed.startsWith("@startuml")
      ? trimmed
      : `@startuml\n${trimmed}\n@enduml`;

    const generator = plantuml.generate(normalized, {
      format: "svg",
      charset: "utf-8",
    });

    const svg = await this.readStream(generator.out);

    if (!svg.trim()) {
      throw new Error("PlantUML did not produce SVG output");
    }

    return toDataUri(svg);
  }

  private readStream(
    stream: NodeJS.ReadableStream | undefined
  ): Promise<string> {
    if (!stream) {
      return Promise.resolve("");
    }

    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];

      stream.on("data", (chunk) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });

      stream.on("error", (error) => {
        reject(error);
      });

      stream.on("end", () => {
        resolve(Buffer.concat(chunks).toString("utf8"));
      });
    });
  }
}
