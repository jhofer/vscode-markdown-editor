import { IMessageFactory } from "./messages";

const requestType = "updateMarkdown-request";
const responseType = "updateMarkdown-response";
const errorType = "updateMarkdown-error";

const updateMarkdownRequest = (markdownText: string) => ({
  type: requestType,
  payload: markdownText,
});

const updateMarkdownResponse = (
  markdownText: string,
  urlLookup?: Record<string, string>
) => ({
  type: responseType,
  payload: { markdownText, urlLookup },
});

const updateMarkdownError = (error: string) => ({
  type: errorType,
  payload: error,
});

export const updateMarkdownMessage: IMessageFactory<
  Parameters<typeof updateMarkdownRequest>,
  Parameters<typeof updateMarkdownResponse>,
  Parameters<typeof updateMarkdownError>,
  ReturnType<typeof updateMarkdownRequest>,
  ReturnType<typeof updateMarkdownResponse>,
  ReturnType<typeof updateMarkdownError>
> = {
  requestType,
  responseType,
  errorType,
  request: updateMarkdownRequest,
  response: updateMarkdownResponse,
  error: updateMarkdownError,
};
