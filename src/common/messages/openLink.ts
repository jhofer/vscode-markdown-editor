import { IMessageFactory } from "./messages";

const requestType = "openLink-request";
const responseType = "openLink-response";
const errorType = "openLink-error";

const openLinkRequest = (href: string) => ({
  type: requestType,
  payload: href,
});

const openLinkResponse = () => ({
  type: responseType,
  payload: {},
});

const openLinkError = (error: string) => ({
  type: errorType,
  payload: error,
});

export const openLinkMessage: IMessageFactory<
  Parameters<typeof openLinkRequest>,
  Parameters<typeof openLinkResponse>,
  Parameters<typeof openLinkError>,
  ReturnType<typeof openLinkRequest>,
  ReturnType<typeof openLinkResponse>,
  ReturnType<typeof openLinkError>
> = {
  requestType,
  responseType,
  errorType,
  request: openLinkRequest,
  response: openLinkResponse,
  error: openLinkError,
};
