import { svgHasOwnBackground } from "../client/editor/components/ViewerImage";

const svg = (attrs: string, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" ${attrs}>${body}</svg>`;

describe("svgHasOwnBackground", () => {
  it.each([
    ["no backdrop", svg('viewBox="0 0 100 50"', '<text x="5" y="20">Hi</text>')],
    ["draw.io transparent root", svg('style="background: transparent; background-color: transparent;" width="100" height="50"', "<g/>")],
    ["rect fill none", svg('viewBox="0 0 100 50"', '<rect width="100" height="50" fill="none"/>')],
    ["zero-alpha fill", svg('viewBox="0 0 100 50"', '<rect width="100%" height="100%" style="fill: rgba(255, 255, 255, 0)"/>')],
    ["zero fill-opacity", svg('viewBox="0 0 100 50"', '<rect width="100" height="50" fill="#fff" fill-opacity="0"/>')],
    ["small first rect", svg('viewBox="0 0 100 50"', '<rect x="10" y="10" width="20" height="20" fill="#fff"/>')],
    ["rect after other shapes", svg('viewBox="0 0 100 50"', '<circle r="3"/><rect width="100" height="50" fill="#fff"/>')],
    ["not an svg", "<html></html>"],
  ])("is false for %s", (_, markup) => {
    expect(svgHasOwnBackground(markup)).toBe(false);
  });

  it.each([
    ["draw.io root background", svg('style="background-color: rgb(255, 255, 255);" width="100" height="50"', "<g/>")],
    ["full-size rect", svg('viewBox="0 0 100 50"', '<rect width="100" height="50" fill="#fff"/><text>Hi</text>')],
    ["percentage rect", svg('width="100" height="50"', '<rect width="100%" height="100%" style="fill:#222"/>')],
    ["rect with default fill", svg('viewBox="-10 -10 100 50"', '<rect x="-10" y="-10" width="100" height="50"/>')],
    [
      "rect nested in groups after defs",
      `<?xml version="1.0"?>${svg('viewBox="0 0 100 50"', '<defs><style>.a{}</style></defs><g><g><rect width="100" height="50" fill="white"/></g></g>')}`,
    ],
  ])("is true for %s", (_, markup) => {
    expect(svgHasOwnBackground(markup)).toBe(true);
  });
});
