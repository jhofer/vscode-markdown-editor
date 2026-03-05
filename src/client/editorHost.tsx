import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import TextareaAutosize from "react-textarea-autosize";
import {
  debounce,
  formatText,
  isBasicallySame,
} from "./utils/utils";
import { fileToDataUrl } from "../common/fileToDataUrl";
import { vsCodeTheme } from "./theme";
import Editor from "./editor";
import "./style.css";
import { useBidirectionalEvent } from "./messages/useBedirectonalEvent";
import { vscode } from "./utils/vscode";
import { useVSCodeState } from "./utils/useVSCodeState";
import { HostMessageBroker } from "../host/hostMessageBroker";
import { useMessageBroker } from "./messages/clientMessageBroker";
import { requestCompletionMessage } from "../common/messages/requestCompletion";
import { useImages } from "./useImages";
import { updateMarkdownMessage } from "../common/messages/updateMarkdown";
import { openLinkMessage } from "../common/messages/openLink";
import { readyMessage } from "../common/messages/ready";

enum EditMode {
  RichText,
  Markdown,
}

interface IEditorHostProps {
  documentUri: string;
}

export function EditorHost(props: IEditorHostProps) {
  const { documentUri } = props;
  const [markdownText, setMarkdownText] =
    useVSCodeState<string>("markdownText");

  const [editMode, setEditMode] = useState<EditMode>(EditMode.RichText);

  // Create a ref to store URL lookups that can be updated by message handler
  const urlLookupRef = useRef<Record<string, string>>({});
  
  // Counter to force editor re-render when URL lookup changes
  const [urlLookupVersion, setUrlLookupVersion] = useState(0);
  
  // Track the last markdown we sent to avoid echo updates
  const lastSentMarkdownRef = useRef<string | undefined>(undefined);
  
  // Track current markdown in a ref (to avoid closure issues in message handler)
  const currentMarkdownRef = useRef<string | undefined>(markdownText);
  currentMarkdownRef.current = markdownText;
  
  // Track if we're expecting an echo (our own update coming back)
  const pendingUpdateRef = useRef<boolean>(false);

  const messageBroker = useMessageBroker(documentUri, (broker) => {
    //add message handlers
    broker.registerHandler(updateMarkdownMessage, ({ markdownText: incomingMarkdown, urlLookup }) => {
      console.log("Received updateMarkdown message:", { 
        markdownText: incomingMarkdown?.substring(0, 100), 
        urlLookup,
        isEcho: pendingUpdateRef.current && isBasicallySame(incomingMarkdown, lastSentMarkdownRef.current)
      });
      
      // Update URL lookup map - check if URLs actually changed
      if (urlLookup) {
        const hasNewUrls = Object.keys(urlLookup).some(
          key => urlLookupRef.current[key] !== urlLookup[key]
        );
        
        if (hasNewUrls) {
          urlLookupRef.current = { ...urlLookupRef.current, ...urlLookup };
          console.log("Updated URL lookup:", urlLookupRef.current);
          // Increment version to force editor re-render with new image URLs
          setUrlLookupVersion(v => v + 1);
        }
      }
      
      // Skip update if this is an echo of our own change (same content coming back)
      // This prevents cursor position loss and flickering
      if (pendingUpdateRef.current && isBasicallySame(incomingMarkdown, lastSentMarkdownRef.current)) {
        console.log("Skipping echo update - content is the same");
        pendingUpdateRef.current = false;
        return;
      }
      
      // Only update if the content is actually different from current state
      // Use ref to get current value (avoids closure issue)
      if (!isBasicallySame(incomingMarkdown, currentMarkdownRef.current)) {
        setMarkdownText(incomingMarkdown);
        console.log("Set markdown text, length:", incomingMarkdown?.length);
      } else {
        console.log("Skipping update - content unchanged");
      }
      
      pendingUpdateRef.current = false;
    });
  });

  const requestCompletion = useBidirectionalEvent(
    messageBroker,
    requestCompletionMessage
  );
  const [uploadImage, urlLookUp] = useImages(messageBroker, urlLookupRef);

  // Memoize the debounced handler to prevent recreation on every render
  const handleOutlineChange = useMemo(
    () =>
      debounce((getVal: () => string) => {
        const outlineText = getVal();
        // Track that we're sending this update so we can ignore the echo
        lastSentMarkdownRef.current = outlineText;
        pendingUpdateRef.current = true;
        // Update the ref to track current content (for comparison)
        currentMarkdownRef.current = outlineText;
        // Send to backend but DON'T update React state
        // The editor already has this content - updating state would cause re-render and cursor loss
        messageBroker.sendMessage(updateMarkdownMessage.request(outlineText));
      }, 200),
    [messageBroker]
  );

  const handleMarkdownChange = useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = event.target.value;
      // Track that we're sending this update so we can ignore the echo
      lastSentMarkdownRef.current = value;
      pendingUpdateRef.current = true;
      messageBroker.sendMessage(updateMarkdownMessage.request(value));
      setMarkdownText(value);
    },
    [messageBroker]
  );

  // Memoize callbacks passed to Editor to prevent unnecessary re-renders
  const handleClickLink = useCallback(
    (href: string, event: MouseEvent) => {
      const msg = openLinkMessage.request(href);
      messageBroker.sendMessage(msg);
    },
    [messageBroker]
  );

  const handleRequestCompletion = useCallback(
    async (context: { prefix: string; suffix: string; mdContent: string; cursorPos: number; fileName: string }) => {
      try {
        const response = await requestCompletion(context);
        // The response has shape { suggestions: string[] }
        return (response && response.suggestions) || [];
      } catch (error) {
        console.error("Completion request failed:", error);
        return [];
      }
    },
    [requestCompletion]
  );

  const rerenderEditor = useCallback((markdown: string | undefined) => {
    // Force re-render by updating the markdown text
    setMarkdownText(markdown);
  }, []);

  const handleSave = useCallback(() => {
    // Flush any pending debounced changes before save completes
    handleOutlineChange.flush();
  }, [handleOutlineChange]);

  useEffect(() => {
    // Send ready message through the message broker
    const msg = readyMessage.request();
    messageBroker.sendMessage(msg);
  }, [messageBroker]);

  const richTextEditor = (
    <Editor
      key={`editor-${urlLookupVersion}`}
      placeholder={"Blank canvas..."}
      theme={vsCodeTheme}
      defaultValue={markdownText}
      value={markdownText}
      onChange={handleOutlineChange}
      onRequestCompletion={handleRequestCompletion}
      uploadImage={uploadImage}
      onClickLink={handleClickLink}
      onGetImageData={urlLookUp}
      onSave={handleSave}
      autoFocus
    />
  );

  const markdownEditor = (
    <TextareaAutosize
      title="Markdown Raw"
      className="markdownRaw"
      onChange={handleMarkdownChange}
      value={markdownText || ""}
    ></TextareaAutosize>
  );

  const editor =
    editMode === EditMode.RichText ? richTextEditor : markdownEditor;

  return (
    <div className="container">
      <div className="toolbar">
        <button
          title="Switch Edit Mode"
          type="button"
          className="btn"
          onClick={() => {
            // Flush any pending debounced changes before switching modes
            handleOutlineChange.flush();
            // Use the ref value, not state, because handleOutlineChange updates the ref
            // but intentionally doesn't update state (to avoid cursor loss in rich text mode)
            rerenderEditor(currentMarkdownRef.current);
            setEditMode(
              editMode === EditMode.RichText
                ? EditMode.Markdown
                : EditMode.RichText
            );
          }}
        >
          {editMode === EditMode.RichText ? "< >" : "👁"}
        </button>
      </div>
      <div style={{ padding: 40, maxWidth: 825, margin: "0 auto" }}>
        {editor}
      </div>
    </div>
  );
}
