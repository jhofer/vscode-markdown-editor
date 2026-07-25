// `refractor` maps its subpaths via package.json "exports" (e.g. "./core" ->
// "lib/core.js", "./*" -> "lang/*.js"). TypeScript's classic/Node10 module
// resolution (this project's `moduleResolution`, tied to `module: commonjs`)
// predates "exports" and doesn't apply that map, so `import ... from
// "refractor/bash"` can't find its declaration file even though the runtime
// bundler (esbuild) resolves it correctly via "exports". These re-export the
// real declaration files by their actual on-disk path, which classic
// resolution can follow directly.
declare module "refractor/core" {
  export * from "refractor/lib/core";
}

declare module "refractor/bash" {
  export { default } from "refractor/lang/bash";
}
declare module "refractor/clike" {
  export { default } from "refractor/lang/clike";
}
declare module "refractor/csharp" {
  export { default } from "refractor/lang/csharp";
}
declare module "refractor/css" {
  export { default } from "refractor/lang/css";
}
declare module "refractor/go" {
  export { default } from "refractor/lang/go";
}
declare module "refractor/java" {
  export { default } from "refractor/lang/java";
}
declare module "refractor/javascript" {
  export { default } from "refractor/lang/javascript";
}
declare module "refractor/json" {
  export { default } from "refractor/lang/json";
}
declare module "refractor/markup" {
  export { default } from "refractor/lang/markup";
}
declare module "refractor/objectivec" {
  export { default } from "refractor/lang/objectivec";
}
declare module "refractor/perl" {
  export { default } from "refractor/lang/perl";
}
declare module "refractor/php" {
  export { default } from "refractor/lang/php";
}
declare module "refractor/powershell" {
  export { default } from "refractor/lang/powershell";
}
declare module "refractor/python" {
  export { default } from "refractor/lang/python";
}
declare module "refractor/ruby" {
  export { default } from "refractor/lang/ruby";
}
declare module "refractor/rust" {
  export { default } from "refractor/lang/rust";
}
declare module "refractor/sql" {
  export { default } from "refractor/lang/sql";
}
declare module "refractor/typescript" {
  export { default } from "refractor/lang/typescript";
}
declare module "refractor/yaml" {
  export { default } from "refractor/lang/yaml";
}
