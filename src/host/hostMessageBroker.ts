import { WebviewPanel, Webview } from "vscode";
import { HandlerType, IMessage, IMessageRequest } from "../common/messages";

export class HostMessageBroker {
  messageHandlers: Map<string, HandlerType> = new Map();
  documentUri: string;
  webview: Webview;

  public constructor(webviewPanel: WebviewPanel, documentUri: string) {
    this.documentUri = documentUri;
    this.webview = webviewPanel.webview;
    webviewPanel.webview.onDidReceiveMessage(this.handleMessage.bind(this));
  }

  public registerHandler(type: string, handler: HandlerType): void {
    this.messageHandlers.set(type, handler);
  }

  public sendMessage(message: IMessage<unknown>) {
    const request: IMessageRequest = {
      documentUri: this.documentUri,
      message,
    };
    this.webview.postMessage(request);
  }

  private handleMessage(request: IMessageRequest) {
    if (this.documentUri != request.documentUri) {
      return;
    }
    const message = request.message;
    const handler = this.messageHandlers.get(message.type);
    if (!handler) {
      throw new Error(
        `No handler registered for message type: ${message.type}`
      );
    }
    handler(message);
  }
}
