import { IMessageFactory } from "./messages";

const requestType = "searchLink-request";
const responseType = "searchLink-response";
const errorType = "searchLink-error";

const searchLinkRequest = (searchTerm: string) => ({
  type: requestType,
  payload: searchTerm,
});

const searchLinkResponse = (links: string[]) => ({
  type: responseType,
  payload: links,
});

const searchLinkError = (error: string) => ({
  type: errorType,
  payload: error,
});

export const searchLinkMessage: IMessageFactory<
  Parameters<typeof searchLinkRequest>,
  Parameters<typeof searchLinkResponse>,
  Parameters<typeof searchLinkError>,
  ReturnType<typeof searchLinkRequest>,
  ReturnType<typeof searchLinkResponse>,
  ReturnType<typeof searchLinkError>
> = {
  requestType,
  responseType,
  errorType,
  request: searchLinkRequest,
  response: searchLinkResponse,
  error: searchLinkError,
};
