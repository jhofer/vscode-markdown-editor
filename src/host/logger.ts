import * as vscode from "vscode";

export const outputChannel: {
  instance: vscode.OutputChannel | null;
} = {
  instance: null,
};

const printChannelOutput = (content: string, reveal = false): void => {
  if (!outputChannel.instance) {
    throw new Error("Output channel not initialized");
  }
  outputChannel.instance?.appendLine(content);
  if (reveal) {
    outputChannel.instance?.show(true);
  }
};

const toString = (obj: any): string => {
  if (typeof obj === "string") {
    return obj;
  } else if (obj instanceof Error) {
    return `${obj.name}: ${obj.message}\n${obj.stack}`;
  } else {
    return JSON.stringify(obj, null, 2);
  }
};

const logWithPrefix = (
  logLevel: string,
  params: any[],
  reveal = false
): void => {
  const strings = params.map((param) => toString(param));
  const message = strings.join("\n");

  printChannelOutput(`${logLevel}: ${message}`, reveal);
};

const logger = {
  logDebug: (...params: any[]): void => logWithPrefix("Debug", params),

  logInfo: (...params: any[]): void => logWithPrefix("Info", params),

  logWarning: (...params: any[]): void => logWithPrefix("Warning", params),

  logError: (...params: any[]): void => logWithPrefix("Error", params),
};

export const initializeOutputChannel = (): void => {
  outputChannel.instance = vscode.window.createOutputChannel(
    "inkwell.md"
  );
  console.log = (obj: any) => logger.logDebug(obj);
};

export default logger;
