import * as React from "react";
import styled from "styled-components";

type Props = {
  src: string;
  alt?: string;
  draggable?: boolean;
};

export function isSvgImageSource(src: string): boolean {
  if (!src) {
    return false;
  }

  return src.startsWith("data:image/svg+xml") || /\.svg(?:$|[?#])/i.test(src);
}

function decodeBase64Utf8(value: string): string {
  if (typeof window !== "undefined" && typeof window.atob === "function") {
    const binary = window.atob(value);

    if (typeof TextDecoder !== "undefined") {
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      return new TextDecoder("utf-8").decode(bytes);
    }

    return decodeURIComponent(
      Array.from(binary)
        .map((char) => `%${char.charCodeAt(0).toString(16).padStart(2, "0")}`)
        .join("")
    );
  }

  return Buffer.from(value, "base64").toString("utf8");
}

/**
 * Drop everything before the root `<svg>`: a file written by an external tool
 * (draw.io, Inkscape) starts with an XML declaration, a DOCTYPE and often a
 * comment, none of which mean anything once the markup is injected into an
 * HTML document.
 */
export function stripSvgPrologue(svg: string): string {
  const root = /<svg[\s>]/i.exec(svg);
  return root ? svg.slice(root.index) : svg;
}

function sanitizeSvgMarkup(svg: string): string {
  return stripSvgPrologue(svg)
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/\son[a-z]+=("[^"]*"|'[^']*')/gi, "");
}

export function decodeSvgDataUri(src: string): string | undefined {
  if (!src.startsWith("data:image/svg+xml")) {
    return undefined;
  }

  const commaIndex = src.indexOf(",");
  if (commaIndex === -1) {
    return undefined;
  }

  const metadata = src.slice(0, commaIndex);
  const payload = src.slice(commaIndex + 1);

  try {
    const decoded = metadata.includes(";base64")
      ? decodeBase64Utf8(payload)
      : decodeURIComponent(payload);

    return sanitizeSvgMarkup(decoded);
  } catch {
    return undefined;
  }
}

function isVisiblePaint(value: string | null | undefined): boolean {
  if (value == null) {
    return false;
  }
  const paint = value.trim().toLowerCase();
  if (!paint || paint === "none" || paint === "transparent" || paint === "initial") {
    return false;
  }
  // rgba()/hsla() with a zero alpha channel, e.g. rgba(255, 255, 255, 0)
  const alpha = /^(?:rgba|hsla)\(.*[,/]\s*(0*\.?0+%?)\s*\)$/.exec(paint);
  return !(alpha && parseFloat(alpha[1]) === 0);
}

function styleProperty(element: Element, name: string): string | undefined {
  const style = element.getAttribute("style") || "";
  const match = new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*([^;]+)`, "i").exec(style);
  return match ? match[1] : undefined;
}

function parseLength(value: string | null): number | undefined {
  const length = parseFloat(value || "");
  return Number.isFinite(length) ? length : undefined;
}

const NON_RENDERED_ELEMENTS = new Set([
  "defs",
  "desc",
  "metadata",
  "style",
  "title",
  "script",
]);

/**
 * Whether an SVG paints its own backdrop: a background on the root element
 * (draw.io writes `style="background-color: …"`), or a filled rect under
 * everything else that covers the whole canvas (Inkscape, Excalidraw, …).
 * Diagrams without one are transparent, which makes their dark strokes and
 * text disappear on a dark theme or the fullscreen overlay.
 */
export function svgHasOwnBackground(svg: string): boolean {
  if (typeof DOMParser === "undefined") {
    return false;
  }

  try {
    const doc = new DOMParser().parseFromString(
      stripSvgPrologue(svg),
      "image/svg+xml"
    );
    const root = doc.documentElement;
    if (
      !root ||
      root.nodeName.toLowerCase() !== "svg" ||
      doc.getElementsByTagName("parsererror").length > 0
    ) {
      return false;
    }

    if (
      isVisiblePaint(styleProperty(root, "background-color")) ||
      isVisiblePaint(styleProperty(root, "background"))
    ) {
      return true;
    }

    const viewBox = (root.getAttribute("viewBox") || "")
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    const [minX, minY, canvasWidth, canvasHeight] =
      viewBox.length === 4 && viewBox.every(Number.isFinite)
        ? viewBox
        : [0, 0, parseLength(root.getAttribute("width")), parseLength(root.getAttribute("height"))];

    // Walk down to the first element that actually gets drawn, stepping into
    // untransformed groups that merely wrap everything.
    let first: Element | null = root.firstElementChild;
    while (first) {
      const name = first.nodeName.toLowerCase();
      if (NON_RENDERED_ELEMENTS.has(name)) {
        first = first.nextElementSibling;
      } else if (name === "g" && !first.getAttribute("transform")) {
        first = first.firstElementChild;
      } else {
        break;
      }
    }

    if (!first || first.nodeName.toLowerCase() !== "rect") {
      return false;
    }

    const fill = styleProperty(first, "fill") ?? first.getAttribute("fill");
    // An unset fill paints black, which is still a backdrop.
    if (fill != null && !isVisiblePaint(fill)) {
      return false;
    }
    const fillOpacity =
      styleProperty(first, "fill-opacity") ?? first.getAttribute("fill-opacity");
    if (fillOpacity != null && parseFloat(fillOpacity) === 0) {
      return false;
    }

    const covers = (
      attr: string,
      origin: number,
      size: number | undefined,
      offsetAttr: string
    ) => {
      const value = (first as Element).getAttribute(attr) || "";
      if (value.trim() === "100%") {
        return true;
      }
      const length = parseLength(value);
      const offset = parseLength((first as Element).getAttribute(offsetAttr)) ?? 0;
      return (
        size !== undefined &&
        length !== undefined &&
        offset <= origin + 1 &&
        offset + length >= origin + size * 0.98
      );
    };

    return (
      covers("width", minX, canvasWidth, "x") &&
      covers("height", minY, canvasHeight, "y")
    );
  } catch {
    return false;
  }
}

const ViewerImage: React.FC<Props> = ({ src, alt, draggable = false }) => {
  const inlineSvgMarkup = React.useMemo(
    () => (isSvgImageSource(src) ? decodeSvgDataUri(src) : undefined),
    [src]
  );

  if (inlineSvgMarkup) {
    return (
      <InlineSvgContainer
        aria-label={alt || ""}
        dangerouslySetInnerHTML={{ __html: inlineSvgMarkup }}
      />
    );
  }

  return <StyledImage src={src} alt={alt || ""} draggable={draggable} />;
};

export default ViewerImage;

const StyledImage = styled.img`
  display: block;
  max-width: 90vw;
  max-height: 90vh;
  object-fit: contain;
  pointer-events: none;
  border-radius: 2px;
`;

const InlineSvgContainer = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  max-width: 90vw;
  max-height: 90vh;
  pointer-events: none;

  svg {
    display: block;
    max-width: 90vw;
    max-height: 90vh;
    width: auto;
    height: auto;
  }
`;
