import * as React from "react";
import * as ReactDOM from "react-dom";
import styled from "styled-components";

type Props = {
  src: string;
  alt?: string;
  onClose: () => void;
};

const MIN_SCALE = 0.1;
const MAX_SCALE = 10;
const ZOOM_STEP = 0.15;

const ImageViewer: React.FC<Props> = ({ src, alt, onClose }) => {
  const [scale, setScale] = React.useState(1);
  const [translate, setTranslate] = React.useState({ x: 0, y: 0 });
  const isDragging = React.useRef(false);
  const dragStart = React.useRef({ x: 0, y: 0 });
  const translateRef = React.useRef(translate);

  React.useEffect(() => {
    translateRef.current = translate;
  }, [translate]);

  const handleWheel = React.useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const delta = e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;
    setScale((s) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s + delta)));
  }, []);

  const handleMouseDown = React.useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    isDragging.current = true;
    dragStart.current = {
      x: e.clientX - translateRef.current.x,
      y: e.clientY - translateRef.current.y,
    };
  }, []);

  const handleMouseMove = React.useCallback((e: React.MouseEvent) => {
    if (!isDragging.current) return;
    e.preventDefault();
    setTranslate({
      x: e.clientX - dragStart.current.x,
      y: e.clientY - dragStart.current.y,
    });
  }, []);

  const handleMouseUp = React.useCallback(() => {
    isDragging.current = false;
  }, []);

  const handleOverlayClick = React.useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose]
  );

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return ReactDOM.createPortal(
    <Overlay
      onClick={handleOverlayClick}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <ImageContainer
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        style={{
          transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
          cursor: isDragging.current ? "grabbing" : "grab",
        }}
        draggable={false}
      >
        <img src={src} alt={alt || ""} draggable={false} />
      </ImageContainer>
      <CloseButton onClick={onClose} title="Close (Esc)">
        ✕
      </CloseButton>
      <HintText>Scroll to zoom · Drag to pan · Click outside or Esc to close</HintText>
    </Overlay>,
    document.body
  );
};

export default ImageViewer;

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 10000;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  user-select: none;
`;

const ImageContainer = styled.div`
  max-width: 90vw;
  max-height: 90vh;
  transform-origin: center center;
  will-change: transform;

  img {
    display: block;
    max-width: 90vw;
    max-height: 90vh;
    object-fit: contain;
    pointer-events: none;
    border-radius: 2px;
  }
`;

const CloseButton = styled.button`
  position: fixed;
  top: 16px;
  right: 16px;
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
  border: none;
  border-radius: 50%;
  width: 36px;
  height: 36px;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10001;

  &:hover {
    background: rgba(255, 255, 255, 0.3);
  }
`;

const HintText = styled.div`
  position: fixed;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  color: rgba(255, 255, 255, 0.55);
  font-size: 12px;
  pointer-events: none;
  white-space: nowrap;
`;
