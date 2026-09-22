import { DroppedResource } from "../droppedResources";
import { IMessageFactory } from "./messages";

const requestType = "dropResources-request";
const responseType = "dropResources-response";
const errorType = "dropResources-error";

/**
 * Files dropped onto the editor from VS Code (the explorer, another editor
 * tab, ...) arrive as URIs rather than file contents: nothing needs copying,
 * the markdown just has to point at them. Only the host knows where the
 * document lives on disk, so it turns the URIs into document-relative paths.
 */
const dropResourcesRequest = (uris: string[]) => ({
  type: requestType,
  payload: { uris },
});

const dropResourcesResponse = (resources: DroppedResource[]) => ({
  type: responseType,
  payload: { resources },
});

const dropResourcesError = (message: string) => ({
  type: errorType,
  payload: message,
});

export const dropResourcesMessage: IMessageFactory<
  Parameters<typeof dropResourcesRequest>,
  Parameters<typeof dropResourcesResponse>,
  Parameters<typeof dropResourcesError>,
  ReturnType<typeof dropResourcesRequest>,
  ReturnType<typeof dropResourcesResponse>,
  ReturnType<typeof dropResourcesError>
> = {
  requestType,
  responseType,
  errorType,
  request: dropResourcesRequest,
  response: dropResourcesResponse,
  error: dropResourcesError,
};
