import { IMessageFactory } from "./messages";

const requestType = "updateMarkdown-request";
const responseType = "updateMarkdown-response";
const errorType = "updateMarkdown-error";

// `revision` is a client-assigned, monotonically increasing counter, one per
// outgoing edit. The host hands the same number back on the response caused
// by that specific edit landing in the document (see
// RichMarkdownEditorProvider's `pendingRevisions` queue), so the client can
// tell a response for an edit it has since superseded (stale - drop it) apart
// from the response to its latest edit or a genuine external change (both
// safe to apply). Without this, a slow round trip on a big document could
// have an older response overwrite content the user had already typed past.
const updateMarkdownRequest = (markdownText: string, revision: number) => ({
  type: requestType,
  payload: { markdownText, revision },
});

const updateMarkdownResponse = (
  markdownText: string,
  urlLookup?: Record<string, string>,
  rawMarkdownText?: string,
  // Left undefined when this update isn't tied to a specific client request
  // (the initial sync, or a change made outside this webview) - always safe
  // to apply.
  revision?: number
) => ({
  type: responseType,
  payload: { markdownText, urlLookup, rawMarkdownText, revision },
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
