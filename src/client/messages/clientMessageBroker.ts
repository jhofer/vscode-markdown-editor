import { WebviewPanel, Webview } from "vscode";
import {
  HandlerType,
  IMessage,
  IMessageFactory,
  IMessageRequest,
} from "../../common/messages";
import { useEffect, useRef } from "react";
import { vscode } from "../utils";

export const useMessageBroker = (
  documentUri: string,
  setup: (broker: ClientMessageBroker) => void
) => {
  const messageBroker = useRef(new ClientMessageBroker(documentUri));

  useEffect(() => {
    const handler = messageBroker.current.handleMessage.bind(
      messageBroker.current
    );
    window.addEventListener("message", handler);
    setup(messageBroker.current);
    return () => window.removeEventListener("message", handler);
  }, []);

  return messageBroker.current;
};

export class ClientMessageBroker {
  messageHandlers: Array<{ type: string; handler: HandlerType }> = [];
  documentUri: string;

  public constructor(documentUri: string) {
    this.documentUri = documentUri;
  }

  public registerHandler<
    TRequestFunctionParams extends unknown[],
    TResponseFunctionParams extends unknown[],
    TErrorFunctionParams extends unknown[],
    TRequest extends IMessage<unknown> | Promise<IMessage<unknown>>,
    TResponse extends IMessage<unknown>,
    TError extends IMessage<unknown>
  >(
    factory: IMessageFactory<
      TRequestFunctionParams,
      TResponseFunctionParams,
      TErrorFunctionParams,
      TRequest,
      TResponse,
      TError
    >,
    successHandler: (message: TResponse["payload"]) => void,
    errorHandler?: (message: TError["payload"]) => void
  ): void {
    this.messageHandlers.push({
      type: factory.responseType,
      handler: successHandler as HandlerType,
    });

    if (errorHandler) {
      this.messageHandlers.push({
        type: factory.errorType,
        handler: errorHandler as HandlerType,
      });
    }
  }

  private handleMessage(ev: MessageEvent) {
    const request = ev.data as IMessageRequest;
    console.log("ClientMessageBroker received message:", { 
      requestDocumentUri: request.documentUri, 
      thisDocumentUri: this.documentUri,
      messageType: request.message.type 
    });
    if (this.documentUri != request.documentUri) {
      console.log("Ignoring message - document URI mismatch");
      return;
    }
    console.log("HostMessageBroker.handleMessage", request);
    const { type } = request.message;
    const registeredHandler = this.messageHandlers.filter(
      (h) => h.type == type
    );

    if (registeredHandler.length === 0) {
      console.warn(`No handler registered for message type: ${type}`);
      return;
    }
    console.log(`Calling ${registeredHandler.length} handler(s) for type: ${type}`);
    registeredHandler.forEach((h) => {
      h.handler(request.message.payload);
    });
  }

  public sendMessage(message: IMessage<unknown>) {
    const request: IMessageRequest = {
      documentUri: this.documentUri,
      message,
    };
    console.log("vscode.postMessage", request);
    vscode.postMessage(request);
  }
}
