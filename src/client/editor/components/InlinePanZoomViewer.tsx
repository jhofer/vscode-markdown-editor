import * as React from "react";
import * as ReactDOM from "react-dom";
import styled from "styled-components";
import {
  Viewer,
  ViewerContext,
  ViewerProvider,
} from "react-viewer-pan-zoom";
import { isSvgImageSource, decodeSvgDataUri } from "./ViewerImage";

// Zooming is implemented as a CSS `transform: scale()` on the rendered image
// (see buildViewerSettings below / react-viewer-pan-zoom). A plain <img> of an
// SVG data URI gets rasterized once at its laid-out box size, and that fixed
// bitmap is what the compositor then stretches — so large diagrams turn
// pixelated at higher zoom. Rendering the SVG inline in the DOM instead keeps
// it vector at any zoom level. PlantUML/Mermaid also stamp the root <svg>
// with an intrinsic pixel width/height (attribute and/or inline `style`)
// which would otherwise fight the container's CSS sizing, so that is
// stripped in favor of width/height: 100%.
function normalizeInlineSvg(svg: string): string {
  if (typeof DOMParser === "undefined" || typeof XMLSerializer === "undefined") {
    return svg;
  }

  try {
    const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
    const root = doc.documentElement;
    if (
      !root ||
      root.nodeName.toLowerCase() !== "svg" ||
      doc.getElementsByTagName("parsererror").length > 0
    ) {
      return svg;
    }

    root.removeAttribute("width");
    root.removeAttribute("height");
    root.style.removeProperty("width");
    root.style.removeProperty("height");
    root.setAttribute("width", "100%");
    root.setAttribute("height", "100%");
    // Match the previous `object-fit: contain` <img> behavior regardless of
    // whatever preserveAspectRatio the diagram renderer emitted (PlantUML
    // sets "none", which would otherwise stretch/distort the diagram).
    root.setAttribute("preserveAspectRatio", "xMidYMid meet");

    return new XMLSerializer().serializeToString(root);
  } catch {
    return svg;
  }
}

type DiagramImageProps = {
  src: string;
  alt?: string;
  whiteBackground: boolean;
};

const DiagramImage: React.FC<DiagramImageProps> = ({
  src,
  alt,
  whiteBackground,
}) => {
  const inlineSvgMarkup = React.useMemo(() => {
    if (!isSvgImageSource(src)) {
      return undefined;
    }
    const decoded = decodeSvgDataUri(src);
    return decoded ? normalizeInlineSvg(decoded) : undefined;
  }, [src]);

  if (inlineSvgMarkup) {
    return (
      <InlineSvgWrapper
        $whiteBackground={whiteBackground}
        aria-label={alt || ""}
        dangerouslySetInnerHTML={{ __html: inlineSvgMarkup }}
      />
    );
  }

  return (
    <RasterImageElement
      src={src}
      alt={alt || ""}
      draggable={false}
      $whiteBackground={whiteBackground}
    />
  );
};

type Props = {
  src: string;
  alt?: string;
  maxWidth?: number;
  maxHeight?: number;
  whiteBackground?: boolean;
  className?: string;
  onEdit?: () => void;
};

const DEFAULT_RATIO = 16 / 10;

const buildViewerSettings = (zoomDefault = 1, fillHeight = false) => ({
  pan: { enabled: true },
  zoom: {
    enabled: true,
    default: zoomDefault,
    min: Math.max(0.02, zoomDefault * 0.25),
    max: 16,
    mouseWheelStep: 0.2,
    zoomButtonStep: 0.2,
  },
  resetView: { enabled: true, keyboardShortcut: "r" },
  centerView: { enabled: true, keyboardShortcut: "c" },
  minimap: {
    enabled: false,
    width: "160px",
    keyboardShortcut: "m",
    outlineStyle: "1px solid #ccc",
    viewportAreaOutlineStyle: "2px solid #333",
  },
  spring: {
    enabled: true,
    rubberband: true,
    rubberbandDistance: 100,
    transition: "transform 0.1s ease-out",
  },
  guides: { enabled: false },
  fillHeight,
});

type ToolbarProps = {
  onFullscreen: () => void;
  onEdit?: () => void;
};

const Toolbar: React.FC<ToolbarProps> = ({ onFullscreen, onEdit }) => {
  const { crop, zoomOut, zoomIn, resetView } = React.useContext(ViewerContext);

  return (
    <Controls>
      {onEdit && (
        <ControlButton type="button" onClick={onEdit} aria-label="Edit source">
          ✎ Edit
        </ControlButton>
      )}
      <ControlButton type="button" onClick={() => zoomOut()} aria-label="Zoom out">
        −
      </ControlButton>
      <ZoomValue>{Math.round((crop?.zoom || 1) * 100)}%</ZoomValue>
      <ControlButton type="button" onClick={() => zoomIn()} aria-label="Zoom in">
        +
      </ControlButton>
      <ControlButton type="button" onClick={() => resetView()} aria-label="Reset view">
        ↺
      </ControlButton>
      <ControlButton type="button" onClick={onFullscreen} aria-label="Fullscreen">
        ⛶
      </ControlButton>
    </Controls>
  );
};

type FullscreenToolbarProps = {
  onClose: () => void;
  container: HTMLElement | null;
};

const FullscreenToolbar: React.FC<FullscreenToolbarProps> = ({ onClose, container }) => {
  const { crop, zoomOut, zoomIn, resetView } = React.useContext(ViewerContext);

  const content = (
    <FullscreenControls>
      <ControlButton type="button" onClick={() => zoomOut()} aria-label="Zoom out">
        −
      </ControlButton>
      <ZoomValue>{Math.round((crop?.zoom || 1) * 100)}%</ZoomValue>
      <ControlButton type="button" onClick={() => zoomIn()} aria-label="Zoom in">
        +
      </ControlButton>
      <ControlButton type="button" onClick={() => resetView()} aria-label="Reset view">
        ↺
      </ControlButton>
      <ControlButton type="button" onClick={onClose} aria-label="Close fullscreen">
        ✕
      </ControlButton>
    </FullscreenControls>
  );

  return container ? ReactDOM.createPortal(content, container) : null;
};

type FullscreenViewerProps = {
  src: string;
  alt?: string;
  whiteBackground?: boolean;
  onClose: () => void;
};

const FullscreenViewer: React.FC<FullscreenViewerProps> = ({
  src,
  alt,
  whiteBackground,
  onClose,
}) => {
  const overlayRef = React.useRef<HTMLDivElement | null>(null);
  const [toolbarContainer, setToolbarContainer] = React.useState<HTMLElement | null>(null);

  React.useEffect(() => {
    setToolbarContainer(overlayRef.current);
  }, []);

  React.useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  const content = (
    <DiagramImage src={src} alt={alt} whiteBackground={whiteBackground || false} />
  );

  return ReactDOM.createPortal(
    <FullscreenOverlay ref={overlayRef} onClick={onClose}>
      <FullscreenContent onClick={(e: React.MouseEvent) => e.stopPropagation()}>
        <ViewerProvider settings={buildViewerSettings(1, true)}>
          <Viewer viewportContent={content} minimapContent={content} />
          <FullscreenToolbar onClose={onClose} container={toolbarContainer} />
        </ViewerProvider>
      </FullscreenContent>
    </FullscreenOverlay>,
    document.body
  );
};

const InlinePanZoomViewer: React.FC<Props> = ({
  src,
  alt,
  maxWidth = 840,
  maxHeight = 520,
  whiteBackground = false,
  className,
  onEdit,
}) => {
  const [naturalSize, setNaturalSize] = React.useState({ width: 0, height: 0 });
  const [isFullscreen, setIsFullscreen] = React.useState(false);

  React.useEffect(() => {
    let mounted = true;
    const image = new Image();
    image.onload = () => {
      if (!mounted) {
        return;
      }

      const width = image.naturalWidth || 0;
      const height = image.naturalHeight || 0;
      setNaturalSize({ width, height });
    };
    image.src = src;

    return () => {
      mounted = false;
    };
  }, [src]);

  const ratio =
    naturalSize.width > 0 && naturalSize.height > 0
      ? naturalSize.width / naturalSize.height
      : DEFAULT_RATIO;
  const targetWidth = naturalSize.width > 0 ? Math.min(naturalSize.width, maxWidth) : maxWidth;

  const content = (
    <DiagramImage src={src} alt={alt} whiteBackground={whiteBackground} />
  );

  return (
    <>
      <ViewerShell
        className={className}
        style={{
          width: `min(100%, ${targetWidth}px)`,
          aspectRatio: `${ratio}`,
          maxHeight: `${maxHeight}px`,
        }}
      >
        <ViewerProvider settings={buildViewerSettings()}>
          <Viewer viewportContent={content} minimapContent={content} />
          <Toolbar onFullscreen={() => setIsFullscreen(true)} onEdit={onEdit} />
        </ViewerProvider>
      </ViewerShell>
      {isFullscreen && (
        <FullscreenViewer
          src={src}
          alt={alt}
          whiteBackground={whiteBackground}
          onClose={() => setIsFullscreen(false)}
        />
      )}
    </>
  );
};

export default InlinePanZoomViewer;

const ViewerShell = styled.div`
  position: relative;
  overflow: hidden;
  border: 1px solid ${(props) => props.theme.divider};
  border-radius: 6px;
  background: ${(props) => props.theme.codeBackground || props.theme.background};
`;

const Controls = styled.div`
  position: absolute;
  right: 8px;
  bottom: 8px;
  display: flex;
  align-items: center;
  gap: 4px;
  z-index: 2;
  background: rgba(0, 0, 0, 0.55);
  border-radius: 999px;
  padding: 3px;
`;

const ControlButton = styled.button`
  border: 0;
  padding: 0 8px;
  min-width: 24px;
  height: 24px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.18);
  color: #fff;
  font-size: 12px;
  line-height: 1;
  cursor: pointer;

  &:hover {
    background: rgba(255, 255, 255, 0.28);
  }
`;

const ZoomValue = styled.span`
  color: #fff;
  font-size: 11px;
  min-width: 46px;
  text-align: center;
`;

const RasterImageElement = styled.img<{ $whiteBackground: boolean }>`
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
  background: ${(props) => (props.$whiteBackground ? "#ffffff" : "transparent")};
`;

const InlineSvgWrapper = styled.div<{ $whiteBackground: boolean }>`
  width: 100%;
  height: 100%;
  display: block;
  background: ${(props) => (props.$whiteBackground ? "#ffffff" : "transparent")};

  svg {
    width: 100%;
    height: 100%;
    display: block;
  }
`;

const FullscreenOverlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 10000;
  background: rgba(0, 0, 0, 0.88);
  display: flex;
  align-items: center;
  justify-content: center;
`;

const FullscreenContent = styled.div`
  position: relative;
  width: 100vw;
  height: 100vh;
  display: flex;
  min-width: 0;
  min-height: 0;

  > * {
    width: 100%;
    height: 100%;
    display: flex;
    min-width: 0;
    min-height: 0;
  }
`;

const FullscreenControls = styled.div`
  position: absolute;
  right: 16px;
  bottom: 16px;
  display: flex;
  align-items: center;
  gap: 4px;
  z-index: 2;
  background: rgba(0, 0, 0, 0.65);
  border-radius: 999px;
  padding: 3px;
`;

