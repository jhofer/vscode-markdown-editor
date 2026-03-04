import { fileToDataUrl } from "../fileToDataUrl";
import { IMessageFactory } from "./messages";

const requestType = "uploadImage-request";
const responseType = "uploadImage-response";
const errorType = "uploadImage-error";

const uploadImageRequest = async (file: File) => {
  const imageUrl = await fileToDataUrl(file);
  const fileName = file.name;

  return {
    type: requestType,
    payload: {
      fileName,
      imageUrl,
    },
  };
};

const uploadImageResponse = (src: string, rawsrc: string) => ({
  type: responseType,
  payload: { src, rawsrc },
});

const uploadImageError = (message: string) => ({
  type: errorType,
  payload: message,
});

export const uploadImageMessage: IMessageFactory<
  Parameters<typeof uploadImageRequest>,
  Parameters<typeof uploadImageResponse>,
  Parameters<typeof uploadImageError>,
  ReturnType<typeof uploadImageRequest>,
  ReturnType<typeof uploadImageResponse>,
  ReturnType<typeof uploadImageError>
> = {
  requestType,
  responseType,
  errorType,
  request: uploadImageRequest,
  response: uploadImageResponse,
  error: uploadImageError,
};
