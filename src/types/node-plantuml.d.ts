declare module "node-plantuml" {
  type PlantUmlGenerator = {
    out?: NodeJS.ReadableStream;
  };

  type GenerateOptions = {
    format?: string;
    charset?: string;
    [key: string]: unknown;
  };

  const api: {
    generate(source: string, options?: GenerateOptions): PlantUmlGenerator;
  };

  export default api;
}
