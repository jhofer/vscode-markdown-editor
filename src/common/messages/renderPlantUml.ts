import { IMessageFactory } from "./messages";

const requestType = "renderPlantUml-request";
const responseType = "renderPlantUml-response";
const errorType = "renderPlantUml-error";

export type PlantUmlRenderResponsePayload = {
  imageData: string;
  mimeType: "image/svg+xml";
};

const renderPlantUmlRequest = (source: string) => ({
  type: requestType,
  payload: {
    source,
  },
});

const renderPlantUmlResponse = (
  imageData: string,
  mimeType: "image/svg+xml" = "image/svg+xml"
) => ({
  type: responseType,
  payload: {
    imageData,
    mimeType,
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
