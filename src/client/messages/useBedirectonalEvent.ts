import { useEffect, useRef } from "react";
import { IMessage, IMessageFactory } from "../../common/messages";
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
    messageBroker.registerHandler(
      message,
      (payload) => {
        if (resultCallback.current) {
          resultCallback.current(payload as TResponse["payload"]);
        }
      },
      (payload) => {
        if (errorCallback.current) {
          errorCallback.current(payload as TError["payload"]);
        }
      }
    );
  }, [messageBroker, message]);

  // get function parameters of message.request

  type requestFunctionType = typeof message.request;
  type requestFunctionParameters = Parameters<requestFunctionType>;
  const sendMessage = async (...params: requestFunctionParameters) => {
    const promise = new Promise<TResponse["payload"]>((resolve, reject) => {
      resultCallback.current = resolve;
      errorCallback.current = reject;
    });

    const request = await message.request(...params);
    messageBroker.sendMessage(request);

    const result = await promise;
    return result;
  };

  return sendMessage;
};
