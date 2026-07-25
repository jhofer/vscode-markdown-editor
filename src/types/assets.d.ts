// Ambient module declarations for non-TS assets imported directly by source
// files. esbuild handles ".css" imports at bundle time (client build), and
// the Jest config transforms ".md" files into plain string exports via
// jest-md-transformer.js for tests. TypeScript has no built-in knowledge of
// either, so without these declarations importing such files is a type
// error.
declare module "*.css";

declare module "*.md" {
  const content: string;
  export default content;
}
