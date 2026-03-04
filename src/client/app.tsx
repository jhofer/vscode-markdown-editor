import React, { useEffect, useState } from "react";
import { vscode } from "./utils";
import { EditorHost } from "./editorHost";
import { IMessageRequest } from "../common/messages";
import { initMessage } from "../common/messages/init";

export const App = () => {
  const [documentUri, setUri] = useState<string>();
  useEffect(() => {
    function messageHandler(event: MessageEvent) {
      const request = event.data as IMessageRequest; // The json data that the extension sent
      console.log("request", request);

      const {
        message: { type },
        documentUri,
      } = request;

      if (type === initMessage.responseType) {
        setUri(documentUri);
      }
    }

    window.addEventListener("message", messageHandler);
    return () => window.removeEventListener("message", messageHandler);
  }, []);

  if (documentUri) {
    return <EditorHost documentUri={documentUri} />;
  } else {
    return <></>;
  }
};
