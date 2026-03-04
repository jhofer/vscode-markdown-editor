import { IMessageFactory } from "./messages";

const requestType = "ready-request";
const responseType = "ready-response";
const errorType = "ready-error";

const readyRequest = () => ({
  type: requestType,
  payload: {},
});

const readyResponse = () => ({
  type: responseType,
  payload: {},
});

const readyError = (error: string) => ({
  type: errorType,
  payload: error,
});

export const readyMessage: IMessageFactory<
  Parameters<typeof readyRequest>,
  Parameters<typeof readyResponse>,
  Parameters<typeof readyError>,
  ReturnType<typeof readyRequest>,
  ReturnType<typeof readyResponse>,
  ReturnType<typeof readyError>
> = {
  requestType,
  responseType,
  errorType,
  request: readyRequest,
  response: readyResponse,
  error: readyError,
};
