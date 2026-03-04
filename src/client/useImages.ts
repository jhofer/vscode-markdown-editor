import { useRef, MutableRefObject } from "react";
import { ClientMessageBroker } from "./messages/clientMessageBroker";
import { useBidirectionalEvent } from "./messages/useBedirectonalEvent";
import { uploadImageMessage } from "../common/messages";
import { fileToDataUrl } from "../common/fileToDataUrl";

type lookupRefType = (rawsrc: string) => string;
type uploadImageType = (file: File) => Promise<{ rawsrc: string; src: string }>;
export const useImages = (
  messageBroker: ClientMessageBroker,
  externalUrlLookupRef?: MutableRefObject<Record<string, string>>
): [uploadImageType, lookupRefType] => {
  const internalUrlLookUpRef = useRef<Record<string, string | undefined>>({});
  
  // Use external ref if provided, otherwise use internal ref
  const urlLookUpRef = externalUrlLookupRef || internalUrlLookUpRef;

  const uploadImage = useBidirectionalEvent(messageBroker, uploadImageMessage);

  const uploadImageHandler: uploadImageType = async (file: File) => {
    const uploadResult = await uploadImage(file);
    const { rawsrc, src } = uploadResult;

    urlLookUpRef.current = {
      ...urlLookUpRef.current,
      [rawsrc]: src,
    };
    return uploadResult;
  };

  const lookupRef = (rawSrc: string) => {
    const result = urlLookUpRef.current[rawSrc] ?? rawSrc;
    console.log("Image lookup:", { rawSrc, result, allMappings: urlLookUpRef.current });
    return result;
  };

  return [uploadImageHandler, lookupRef];
};
