import { light } from "./theme";

// styled-components v6 ships its own types but leaves `DefaultTheme` as an
// empty interface for consumers to augment with their actual theme shape
// (https://styled-components.com/docs/api#typescript). `light`/`dark` in
// `./theme` share this shape (`dark` only overrides existing keys).
type Theme = typeof light;

declare module "styled-components" {
  export interface DefaultTheme extends Theme {
    // Referenced in editor.ts but never defined in ./theme (pre-existing gap,
    // not introduced here) - always undefined at runtime today.
    tableHeaderBackground?: string;
  }
}
