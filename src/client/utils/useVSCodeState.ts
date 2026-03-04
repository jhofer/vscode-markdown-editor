import { SetStateAction, useEffect, useState, Dispatch } from "react";
import { vscode } from "./vscode";

export const useVSCodeState = <T>(
  key: string,
  defaultValue?: T | (() => T) | undefined
): [T | undefined, Dispatch<SetStateAction<T | undefined>>] => {
  const [value, setValue] = useState<T | undefined>(defaultValue);

  useEffect(() => {
    const currentState = vscode.getState();
    if (currentState) {
      const storedValue = currentState[key];
      if (storedValue !== undefined) {
        setValue(storedValue);
      }
    }
  }, []);

  useEffect(() => {
    const currentState = vscode.getState();
    vscode.setState({
      ...currentState,
      [key]: value,
    });
  }, [value]);

  return [value, setValue];
};
