import { useEffect, useRef } from "react";
import { IMessage, IMessageFactory } from "../../common/messages";
import { vscode } from "../utils";
import { ClientMessageBroker } from "./clientMessageBroker";

export const useBidirectionalEvent = <
  TRequestFunctionParams extends unknown[],
  TResponseFunctionParams extends unknown[],
  TErrorFunctionParams extends unknown[],
  TRequest extends IMessage<unknown> | Promise<IMessage<unknown>>,
  TResponse extends IMessage<unknown>,
  TError extends IMessage<unknown>
>(
  messageBroker: ClientMessageBroker,
  message: IMessageFactory<
    TRequestFunctionParams,
    TResponseFunctionParams,
    TErrorFunctionParams,
    TRequest,
    TResponse,
    TError
  >
) => {
  const resultCallback = useRef<(result: TResponse["payload"]) => void>();
  const errorCallback = useRef<(result: TError["payload"]) => void>();
  useEffect(() => {
    messageBroker.registerHandler(message.responseType, (m) => {
      if (resultCallback.current) {
        const { payload } = m as TResponse;
        resultCallback.current(payload!);
      }
    });
    messageBroker.registerHandler(message.errorType, (m) => {
      if (errorCallback.current) {
        const { payload } = m as TError;
        errorCallback.current(payload!);
      }
    });
  }, [messageBroker]);

  // get function parameters of message.request

  type requestFunctionType = typeof message.request;
  type requestFunctionParameters = Parameters<requestFunctionType>;
  const sendMessage = async (...params: requestFunctionParameters) => {
    const request = await message.request(...params);
    messageBroker.sendMessage(request);

    const promise = new Promise<TResponse["payload"]>((resolve, reject) => {
      resultCallback.current = resolve;
      errorCallback.current = reject;
    });

    const result = await promise;
    return result;
  };

  return sendMessage;
};
