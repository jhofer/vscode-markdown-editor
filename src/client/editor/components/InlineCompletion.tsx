import React from "react";
import styled from "styled-components";

interface InlineCompletionProps {
  suggestion: string;
  isLoading: boolean;
  cursorCoords?: { top: number; left: number } | null;
}

const CompletionContainer = styled.div<{ top?: number; left?: number }>`
  position: ${(props) => props.top !== undefined ? "absolute" : "relative"};
  display: inline;
  ${(props) =>
    props.top !== undefined && props.left !== undefined
      ? `top: ${props.top}px; left: ${props.left}px;`
      : ""}
  white-space: nowrap;
  z-index: 1000;
`;

const CompletionText = styled.span`
  opacity: 0.4;
  color: inherit;
  font-style: italic;
  pointer-events: none;
  user-select: none;
  background: linear-gradient(90deg, rgba(0, 0, 0, 0.02), transparent);
  padding: 0 2px;
  border-radius: 2px;
`;

const CompletionBadge = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 600;
  color: #888;
  letter-spacing: 0.5px;
  margin-left: 4px;
  opacity: 0.6;
  pointer-events: none;

  &::before {
    content: "✨ Copilot";
  }
`;

const LoadingDot = styled.span<{ delay: number }>`
  display: inline-block;
  width: 3px;
  height: 3px;
  background-color: #999;
  border-radius: 50%;
  margin: 0 1px;
  animation: Loading 1.4s infinite;
  animation-delay: ${(props) => props.delay}ms;

  @keyframes Loading {
    0%,
    60%,
    100% {
      opacity: 0.3;
    }
    30% {
      opacity: 1;
    }
  }
`;

/**
 * InlineCompletion displays a faded suggestion for user to accept with Tab
 * Shows loading state while fetching completion from Copilot
 */
export const InlineCompletion: React.FC<InlineCompletionProps> = ({
  suggestion,
  isLoading,
  cursorCoords,
}) => {
  // Don't render if no suggestion and not loading
  if (!suggestion && !isLoading) {
    return null;
  }

  return (
    <CompletionContainer top={cursorCoords?.top} left={cursorCoords?.left}>
      {isLoading ? (
        <>
          <CompletionText>
            <LoadingDot delay={0} />
            <LoadingDot delay={140} />
            <LoadingDot delay={280} />
          </CompletionText>
          <CompletionBadge />
        </>
      ) : (
        <>
          <CompletionText>{suggestion}</CompletionText>
          <span style={{ fontSize: "11px", marginLeft: "4px", color: "#aaa" }}>
            (Tab to accept)
          </span>
        </>
      )}
    </CompletionContainer>
  );
};
