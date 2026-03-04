import { IMessageFactory } from "./messages";

const requestType = "init-request";
const responseType = "init-response";
const errorType = "init-error";

const initRequest = () => ({
  type: requestType,
  payload: {},
});

const initResponse = () => ({
  type: responseType,
  payload: {},
});

const initError = (error: string) => ({
  type: errorType,
  payload: error,
});

export const initMessage: IMessageFactory<
  Parameters<typeof initRequest>,
  Parameters<typeof initResponse>,
  Parameters<typeof initError>,
  ReturnType<typeof initRequest>,
  ReturnType<typeof initResponse>,
  ReturnType<typeof initError>
> = {
  requestType,
  responseType,
  errorType,
  request: initRequest,
  response: initResponse,
  error: initError,
};
