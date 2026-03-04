export type JsonValueType = string | string | number | boolean | null;
export type JsonArrayType =
  | Array<string>
  | Array<JsonObjectType>
  | Array<string>
  | Array<number>
  | Array<boolean>
  | Array<null>;

export type JsonObjectType = {
  [key: string | number]: JsonType;
};

export type JsonType = JsonObjectType | JsonArrayType | JsonValueType;


