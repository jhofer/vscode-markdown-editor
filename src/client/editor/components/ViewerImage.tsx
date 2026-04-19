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

function sanitizeSvgMarkup(svg: string): string {
  return svg
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
