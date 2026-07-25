// This project pins @types/react@17, which predates the `React.JSX`
// namespace convention. Newer TypeScript versions (and libraries whose type
// declarations were updated for it, e.g. @types/styled-components) expect
// JSX-related helper types to live under `React.JSX` rather than the old
// bare global `JSX` namespace. Without this shim, JSX/generic-component type
// inference throughout the codebase (styled-components, forwardRef
// components, etc.) breaks because `React.JSX` doesn't exist under
// @types/react@17.
//
// This re-exposes the existing (already-correct) global `JSX` namespace
// under `React.JSX`, so consumers written against the newer convention keep
// working. The aliases are captured before entering the `declare global`
// block below so that the bare `JSX.*` references resolve to the original
// global namespace rather than recursively to the `React.JSX` we're
// declaring. Remove this file if/when @types/react is upgraded to a version
// that ships `React.JSX` itself.
//
// The empty `interface X extends Y {}` bodies below are intentional: JSX
// namespace members must be interfaces (not type aliases) to preserve
// declaration merging if @types/react ever adds its own `React.JSX` members,
// so disable the lint rule that otherwise flags them as redundant.
/* eslint-disable @typescript-eslint/no-empty-interface */
type OriginalJSXElement = JSX.Element;
type OriginalJSXElementClass = JSX.ElementClass;
type OriginalJSXElementAttributesProperty = JSX.ElementAttributesProperty;
type OriginalJSXElementChildrenAttribute = JSX.ElementChildrenAttribute;
type OriginalJSXLibraryManagedAttributes<C, P> = JSX.LibraryManagedAttributes<
  C,
  P
>;
type OriginalJSXIntrinsicAttributes = JSX.IntrinsicAttributes;
type OriginalJSXIntrinsicClassAttributes<T> = JSX.IntrinsicClassAttributes<T>;
type OriginalJSXIntrinsicElements = JSX.IntrinsicElements;

declare global {
  namespace React {
    namespace JSX {
      interface Element extends OriginalJSXElement {}
      interface ElementClass extends OriginalJSXElementClass {}
      interface ElementAttributesProperty
        extends OriginalJSXElementAttributesProperty {}
      interface ElementChildrenAttribute
        extends OriginalJSXElementChildrenAttribute {}
      type LibraryManagedAttributes<C, P> = OriginalJSXLibraryManagedAttributes<
        C,
        P
      >;
      interface IntrinsicAttributes extends OriginalJSXIntrinsicAttributes {}
      interface IntrinsicClassAttributes<T>
        extends OriginalJSXIntrinsicClassAttributes<T> {}
      interface IntrinsicElements extends OriginalJSXIntrinsicElements {}
    }
  }
}

export {};
