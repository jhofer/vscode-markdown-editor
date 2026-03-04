import { IMessageFactory } from "./messages";

const requestType = "requestCompletion-request";
const responseType = "requestCompletion-response";
const errorType = "requestCompletion-error";

export interface CompletionContext {
  prefix: string; // Text before cursor
  suffix: string; // Text after cursor
  mdContent: string; // Full document content
  cursorPos: number; // Cursor position in document
  fileName: string; // File being edited
}

const requestCompletionRequest = (context: CompletionContext) => ({
  type: requestType,
  payload: context,
});

const requestCompletionResponse = (suggestions: string[]) => ({
  type: responseType,
  payload: { suggestions },
});

const requestCompletionError = (error: string) => ({
  type: errorType,
  payload: error,
});

export const requestCompletionMessage: IMessageFactory<
  Parameters<typeof requestCompletionRequest>,
  Parameters<typeof requestCompletionResponse>,
  Parameters<typeof requestCompletionError>,
  ReturnType<typeof requestCompletionRequest>,
  ReturnType<typeof requestCompletionResponse>,
  ReturnType<typeof requestCompletionError>
> = {
  requestType,
  responseType,
  errorType,
  request: requestCompletionRequest,
  response: requestCompletionResponse,
  error: requestCompletionError,
};
