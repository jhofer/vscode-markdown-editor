import * as vscode from "vscode";
import logger from "./logger";
import { CompletionContext } from "../common/messages/requestCompletion";

export class CopilotProvider {
  /**
   * Request code completion from GitHub Copilot using VS Code Language Models API
   * Falls back gracefully if Copilot is not available
   */
  async getCompletion(context: CompletionContext): Promise<string[]> {
    try {
      // Check if language models API is available (VS Code 1.90+)
      if (!vscode.lm) {
        logger.logDebug("Language Models API not available");
        return [];
      }

      // Define free tier models in order of preference (fastest first)
      const freeModelPreferences = [
        // Fastest Copilot free models (2026)
        { vendor: "copilot", family: "gpt-4o-mini" },
        { vendor: "copilot", family: "gpt-5-mini" },
        { vendor: "copilot", family: "claude-haiku-4.5" },
      ];

      let selectedModel = null;

      // Try each free tier model preference in order
      for (const preference of freeModelPreferences) {
        const models = await vscode.lm.selectChatModels(preference);

        if (models.length > 0) {
          selectedModel = models.find(
            (model) =>
              model.vendor === preference.vendor &&
              model.family === preference.family,
          );
          if (selectedModel) {
            logger.logDebug("Selected free tier model", {
              vendor: selectedModel.vendor,
              family: selectedModel.family,
              name: selectedModel.name,
            });
          }
          break;
        }
      }

      // If no free tier models found, don't proceed
      if (!selectedModel) {
        logger.logDebug(
          "No free tier models available - completion disabled to avoid costs",
        );
        return [];
      }

      const model = selectedModel;

      // Build a concise prompt for completion
      // Keep context minimal to reduce latency
      const prompt = this.buildCompletionPrompt(context);

      logger.logDebug("Sending prompt to Copilot", prompt);

      // Request completion from the model
      const messages: vscode.LanguageModelChatMessage[] = [
        vscode.LanguageModelChatMessage.User(prompt),
      ];

      const response = await model.sendRequest(
        messages,
        {},
        new vscode.CancellationTokenSource().token,
      );

      // Parse the response and extract suggestions
      // LanguageModelChatResponse is a stream of parts
      const suggestions = await this.parseResponse(response);

      logger.logDebug("Copilot suggestions", { count: suggestions.length });
      return suggestions;
    } catch (error) {
      logger.logDebug("Copilot completion error", { error: String(error) });
      // Silently fail - return empty suggestions
      return [];
    }
  }

  /**
   * Build a focused prompt for markdown continuation
   */
  private buildCompletionPrompt(context: CompletionContext): string {
    const { prefix, suffix } = context;

    logger.logDebug("Completion context", context);

    const contextSize =200;
    const prefixTail = prefix.slice(-contextSize); // Last  chars before cursor
    const suffixHead = suffix.slice(0, contextSize); // First chars after cursor

    // Preserve line breaks and whitespace in the context
    const contextWithCursor = `${prefixTail}{cursorPos}${suffixHead}`;

    return `You are a helpful markdown editor assistant. Continue the markdown text naturally at the cursor position.
Complete the text at the cursor ({cursorPos}). You can provide:
- Single words or phrases to continue the current line
- Multiple lines if it makes sense contextually (lists, paragraphs, code blocks, etc.)
- Proper markdown formatting including line breaks where appropriate

Return ONLY the text after the cursor ({cursorPos}) even if it isnt a complete sentence, nothing else. Preserve proper markdown structure and formatting.

Current text:
${contextWithCursor}
`;
  }

  /**
   * Parse the language model response into suggestions
   */
  private async parseResponse(
    response: vscode.LanguageModelChatResponse,
  ): Promise<string[]> {
    try {
      if (!response) {
        return [];
      }

      // Response.text is an async iterable stream - we need to consume it
      const textStream = (response as any).text;

      if (!textStream) {
        return [];
      }

      let fullText = "";

      // Iterate over the async text stream
      if (Symbol.asyncIterator in textStream) {
        for await (const chunk of textStream) {
          if (typeof chunk === "string") {
            fullText += chunk;
          }
        }
      } else if (Symbol.iterator in textStream) {
        // Fallback for sync iterables
        for (const chunk of textStream as any) {
          if (typeof chunk === "string") {
            fullText += chunk;
          }
        }
      } else {
        logger.logDebug("Text stream is not iterable", {
          hasAsyncIterator: Symbol.asyncIterator in textStream,
          hasSyncIterator: Symbol.iterator in textStream,
          keys: Object.keys(textStream).slice(0, 5),
        });
        return [];
      }

      // Clean up the response but preserve meaningful line breaks
      const cleanedText = fullText
        .replace(/^```[\w]*\n?/g, "") // Remove opening code fence if present
        .replace(/\n?```$/g, "") // Remove closing code fence if present
        .replace(/^\n+/, "") // Remove leading newlines
        .replace(/\n+$/, ""); // Remove trailing newlines

      if (cleanedText.length > 0) {
        logger.logDebug("Extracted text from stream", {
          length: cleanedText.length,
          hasLineBreaks: cleanedText.includes("\n"),
          lineCount: cleanedText.split("\n").length,
          preview: cleanedText.substring(0, 150),
        });
        return [cleanedText];
      }

      return [];
    } catch (error) {
      logger.logDebug("Error parsing response", {
        error: String(error),
        errorMessage: (error as any).message,
      });
      return [];
    }
  }
}
