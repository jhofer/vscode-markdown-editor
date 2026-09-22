import { useRef, MutableRefObject } from "react";
import { ClientMessageBroker } from "./messages/clientMessageBroker";
import { useBidirectionalEvent } from "./messages/useBedirectonalEvent";
import { uploadImageMessage } from "../common/messages";
import { fileToDataUrl } from "../common/fileToDataUrl";

type lookupRefType = (rawsrc: string) => string;
type uploadImageType = (file: File) => Promise<{ rawsrc: string; src: string }>;
type registerImageType = (rawsrc: string, src: string) => void;
export const useImages = (
  messageBroker: ClientMessageBroker,
  externalUrlLookupRef?: MutableRefObject<Record<string, string>>
): [uploadImageType, lookupRefType, registerImageType] => {
  const internalUrlLookUpRef = useRef<Record<string, string | undefined>>({});
  
  // Use external ref if provided, otherwise use internal ref
  const urlLookUpRef = externalUrlLookupRef || internalUrlLookUpRef;

  const uploadImage = useBidirectionalEvent(messageBroker, uploadImageMessage);

  // Teach the editor how to render an image the host just told us about,
  // before the document round trip that would otherwise supply the mapping.
  const registerImage: registerImageType = (rawsrc: string, src: string) => {
    urlLookUpRef.current = {
      ...urlLookUpRef.current,
      [rawsrc]: src,
    };
  };

  const uploadImageHandler: uploadImageType = async (file: File) => {
    const uploadResult = await uploadImage(file);
    const { rawsrc, src } = uploadResult;

    registerImage(rawsrc, src);
    return uploadResult;
  };

  const lookupRef = (rawSrc: string) => {
    const result = urlLookUpRef.current[rawSrc] ?? rawSrc;
    console.log("Image lookup:", { rawSrc, result, allMappings: urlLookUpRef.current });
    return result;
  };

  return [uploadImageHandler, lookupRef, registerImage];
};
