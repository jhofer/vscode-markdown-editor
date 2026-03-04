import { useCallback, useRef, useState } from "react";
import { useBidirectionalEvent } from "../messages/useBedirectonalEvent";
import { ClientMessageBroker } from "../messages/clientMessageBroker";
import { requestCompletionMessage, CompletionContext } from "../../common/messages/requestCompletion";
import { debounce } from "../utils/utils";

export interface UseAutocompleteResult {
  suggestions: string[];
  isLoading: boolean;
  requestCompletion: (context: CompletionContext) => Promise<void>;
}

/**
 * Hook for managing Copilot autocomplete suggestions
 * Handles debouncing, requesting completions from host, and state management
 */
export const useAutocomplete = (
  messageBroker: ClientMessageBroker
): UseAutocompleteResult => {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const requestCompletionRaw = useBidirectionalEvent(
    messageBroker,
    requestCompletionMessage
  );

  // Debounced completion request to avoid hammering the API
  const debouncedRequestCompletion = useRef(
    debounce(
      async (context: CompletionContext) => {
        setIsLoading(true);
        try {
          const result = await requestCompletionRaw(context);
          setSuggestions(result.suggestions || []);
        } catch (error) {
          console.error("Completion request failed:", error);
          setSuggestions([]);
        } finally {
          setIsLoading(false);
        }
      },
      300 // Debounce for 300ms
    )
  ).current;

  const requestCompletion = useCallback(
    async (context: CompletionContext) => {
      debouncedRequestCompletion(context);
    },
    [debouncedRequestCompletion]
  );

  return {
    suggestions,
    isLoading,
    requestCompletion,
  };
};
