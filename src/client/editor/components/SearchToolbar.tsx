import * as React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styled from "styled-components";
import { EditorView } from "prosemirror-view";
import { TextSelection } from "prosemirror-state";
import {
  SearchQuery,
  setSearchState,
  findNext,
  findPrev,
} from "prosemirror-search";
import { CaretUpIcon, CaretDownIcon, CloseIcon } from "outline-icons";
import baseDictionary from "../dictionary";
import { countMatches } from "../lib/searchMatches";

type Props = {
  view: EditorView;
  isActive: boolean;
  dictionary: typeof baseDictionary;
  onOpen: () => void;
  onClose: () => void;
};

const SSR = typeof window === "undefined";
const isMac = !SSR && /Mac|iPod|iPhone|iPad/.test(window.navigator.platform);

const emptyQuery = new SearchQuery({ search: "" });

function isModF(event: KeyboardEvent) {
  return (
    event.key.toLowerCase() === "f" && (isMac ? event.metaKey : event.ctrlKey)
  );
}

export default function SearchToolbar({
  view,
  isActive,
  dictionary,
  onOpen,
  onClose,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [term, setTerm] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);

  const query = useMemo(
    () => new SearchQuery({ search: term, caseSensitive }),
    [term, caseSensitive]
  );

  // Push the current query into the editor's search plugin. When `jumpToFirst`
  // is set the selection is moved to the first match so it renders as the
  // active (emphasised) highlight and the counter reads "1 of N".
  const applyQuery = useCallback(
    (q: SearchQuery, jumpToFirst: boolean) => {
      let tr = setSearchState(view.state.tr, q.valid ? q : emptyQuery);
      if (jumpToFirst && q.valid) {
        const first = q.findNext(view.state, 0);
        if (first) {
          tr = tr
            .setSelection(TextSelection.create(tr.doc, first.from, first.to))
            .scrollIntoView();
        }
      }
      view.dispatch(tr);
    },
    [view]
  );

  const close = useCallback(() => {
    const { state } = view;
    let tr = setSearchState(state.tr, emptyQuery);
    // Collapse the selection that navigation left on the last match so the
    // formatting toolbar doesn't pop up the moment search closes; the caret
    // lands at the end of that match, ready for editing.
    if (!state.selection.empty) {
      tr = tr.setSelection(TextSelection.create(tr.doc, state.selection.to));
    }
    view.dispatch(tr);
    onClose();
    view.focus();
  }, [view, onClose]);

  const focusInput = useCallback(() => {
    const input = inputRef.current;
    if (input) {
      input.focus();
      input.select();
    }
  }, []);

  const goNext = useCallback(() => {
    findNext(view.state, view.dispatch, view);
    inputRef.current?.focus();
  }, [view]);

  const goPrev = useCallback(() => {
    findPrev(view.state, view.dispatch, view);
    inputRef.current?.focus();
  }, [view]);

  // Re-run the query whenever the term / case-sensitivity changes while open.
  useEffect(() => {
    if (isActive) {
      applyQuery(query, true);
    }
  }, [query, isActive, applyQuery]);

  // Autofocus the input when the toolbar opens.
  useEffect(() => {
    if (isActive) {
      focusInput();
    }
  }, [isActive, focusInput]);

  // Fallback key handling for when the editor DOM is not focused (the editor's
  // own `Mod-f` keymap covers the focused case). Also closes on Escape.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (isModF(event)) {
        event.preventDefault();
        onOpen();
        // Wait a frame in case the toolbar is mounting for the first time.
        window.requestAnimationFrame(focusInput);
        return;
      }
      if (event.key === "Escape" && isActive) {
        event.preventDefault();
        close();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isActive, onOpen, close, focusInput]);

  if (!isActive) {
    return null;
  }

  const { total, current } = countMatches(view.state, query);
  const counterLabel = !term
    ? ""
    : total === 0
    ? dictionary.noResults
    : dictionary.searchMatches(current || 1, total);

  const onInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      if (event.shiftKey) {
        goPrev();
      } else {
        goNext();
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  };

  return (
    <Wrapper>
      <Input
        ref={inputRef}
        type="text"
        value={term}
        placeholder={dictionary.searchPlaceholder}
        onChange={(event) => setTerm(event.target.value)}
        onKeyDown={onInputKeyDown}
        spellCheck={false}
        autoComplete="off"
      />
      <Counter data-empty={total === 0 || !term}>{counterLabel}</Counter>
      <CaseToggle
        type="button"
        active={caseSensitive}
        title={dictionary.searchMatchCase}
        aria-pressed={caseSensitive}
        onClick={() => {
          setCaseSensitive((value) => !value);
          focusInput();
        }}
      >
        Aa
      </CaseToggle>
      <IconButton
        type="button"
        title={dictionary.searchPreviousMatch}
        disabled={total === 0}
        onClick={goPrev}
      >
        <CaretUpIcon color="currentColor" />
      </IconButton>
      <IconButton
        type="button"
        title={dictionary.searchNextMatch}
        disabled={total === 0}
        onClick={goNext}
      >
        <CaretDownIcon color="currentColor" />
      </IconButton>
      <IconButton
        type="button"
        title={dictionary.searchClose}
        onClick={close}
      >
        <CloseIcon color="currentColor" />
      </IconButton>
    </Wrapper>
  );
}

const Wrapper = styled.div`
  position: fixed;
  top: 8px;
  right: 8px;
  z-index: ${(props) => props.theme.zIndex + 100};
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 6px;
  border-radius: 4px;
  background: var(--vscode-editorWidget-background, ${(props) => props.theme.background});
  color: var(--vscode-editorWidget-foreground, ${(props) => props.theme.text});
  border: 1px solid var(--vscode-editorWidget-border, transparent);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  font-family: ${(props) => props.theme.fontFamily};
  font-size: 13px;

  @media print {
    display: none;
  }
`;

const Input = styled.input`
  width: 180px;
  height: 24px;
  padding: 0 6px;
  border-radius: 2px;
  border: 1px solid var(--vscode-input-border, transparent);
  background: var(--vscode-input-background, #ffffff);
  color: var(--vscode-input-foreground, inherit);
  font-family: inherit;
  font-size: 13px;
  outline: none;

  &:focus {
    border-color: var(--vscode-focusBorder, #007fd4);
  }

  &::placeholder {
    color: var(--vscode-input-placeholderForeground, #888);
  }
`;

const Counter = styled.span`
  min-width: 52px;
  padding: 0 2px;
  text-align: center;
  white-space: nowrap;
  opacity: 0.8;
  font-variant-numeric: tabular-nums;

  &[data-empty="true"] {
    opacity: 0.6;
  }
`;

const IconButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: none;
  border-radius: 3px;
  background: none;
  color: inherit;
  cursor: pointer;

  &:hover:not(:disabled) {
    background: var(--vscode-toolbar-hoverBackground, rgba(128, 128, 128, 0.2));
  }

  &:disabled {
    opacity: 0.4;
    cursor: default;
  }
`;

const CaseToggle = styled(IconButton)<{ active: boolean }>`
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
  background: ${(props) =>
    props.active
      ? "var(--vscode-inputOption-activeBackground, rgba(0, 127, 212, 0.4))"
      : "none"};
  color: ${(props) =>
    props.active
      ? "var(--vscode-inputOption-activeForeground, inherit)"
      : "inherit"};
  border: 1px solid
    ${(props) =>
      props.active
        ? "var(--vscode-inputOption-activeBorder, transparent)"
        : "transparent"};
`;
