import { IMessageFactory } from "./messages";

const requestType = "renderPlantUml-request";
const responseType = "renderPlantUml-response";
const errorType = "renderPlantUml-error";

const renderPlantUmlRequest = (source: string) => ({
  type: requestType,
  payload: {
    source,
  },
});

const renderPlantUmlResponse = (imageData: string) => ({
  type: responseType,
  payload: {
    imageData,
  },
});

const renderPlantUmlError = (error: string) => ({
  type: errorType,
  payload: error,
});

export const renderPlantUmlMessage: IMessageFactory<
  Parameters<typeof renderPlantUmlRequest>,
  Parameters<typeof renderPlantUmlResponse>,
  Parameters<typeof renderPlantUmlError>,
  ReturnType<typeof renderPlantUmlRequest>,
  ReturnType<typeof renderPlantUmlResponse>,
  ReturnType<typeof renderPlantUmlError>
> = {
  requestType,
  responseType,
  errorType,
  request: renderPlantUmlRequest,
  response: renderPlantUmlResponse,
  error: renderPlantUmlError,
};
