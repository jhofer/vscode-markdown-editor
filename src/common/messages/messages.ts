export interface IMessage<T> {
  type: string;
  payload: T;
}

export interface IMessageRequest {
  documentUri: string;
  message: IMessage<unknown>;
}
export type HandlerType = (m: unknown) => void;

export interface IMessageFactory<
  TRequestFunctionParams extends unknown[],
  TResponseFunctionParams extends unknown[],
  TErrorFunctionParams extends unknown[],
  TRequest extends IMessage<unknown> | Promise<IMessage<unknown>>,
  TResponse extends IMessage<unknown>,
  TError extends IMessage<unknown>
> {
  requestType: string;
  responseType: string;
  errorType: string;
  request: (...params: TRequestFunctionParams) => TRequest;
  response: (...params: TResponseFunctionParams) => TResponse;
  error: (...params: TErrorFunctionParams) => TError;
}
