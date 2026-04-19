import * as React from "react";

type Props = React.HTMLAttributes<HTMLDivElement> & {
  onSingleClick?: () => void;
  onDoubleClickAction?: () => void;
  clickDelay?: number;
  disabled?: boolean;
};

export function createDeferredClickHandlers(
  onSingleClick: () => void,
  onDoubleClick?: () => void,
  delay = 200
) {
  let timeoutId: number | undefined;

  const clearPendingClick = () => {
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
      timeoutId = undefined;
    }
  };

  return {
    handleClick: () => {
      clearPendingClick();
      timeoutId = window.setTimeout(() => {
        timeoutId = undefined;
        onSingleClick();
      }, delay);
    },
    handleDoubleClick: () => {
      clearPendingClick();
      (onDoubleClick ?? onSingleClick)();
    },
    clearPendingClick,
  };
}

const DoubleClickableDiv: React.FC<Props> = ({
  onSingleClick,
  onDoubleClickAction,
  clickDelay = 200,
  disabled = false,
  children,
  ...rest
}) => {
  const handlers = React.useMemo(
    () =>
      createDeferredClickHandlers(
        () => onSingleClick?.(),
        onDoubleClickAction ? () => onDoubleClickAction() : undefined,
        clickDelay
      ),
    [clickDelay, onDoubleClickAction, onSingleClick]
  );

  React.useEffect(() => {
    return () => {
      handlers.clearPendingClick();
    };
  }, [handlers]);

  const handleClick = React.useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (disabled) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      if (event.detail > 1 || !onSingleClick) {
        return;
      }

      handlers.handleClick();
    },
    [disabled, handlers, onSingleClick]
  );

  const handleDoubleClick = React.useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (disabled) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      if (!onSingleClick && !onDoubleClickAction) {
        return;
      }

      handlers.handleDoubleClick();
    },
    [disabled, handlers, onDoubleClickAction, onSingleClick]
  );

  return (
    <div {...rest} onClick={handleClick} onDoubleClick={handleDoubleClick}>
      {children}
    </div>
  );
};

export default DoubleClickableDiv;
