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

      // Try to find Copilot models without specific family constraint
      let models = await vscode.lm.selectChatModels({
        vendor: "copilot",
      });

      // If no Copilot models found, try any available model
      if (models.length === 0) {
        logger.logDebug("No Copilot vendor models, trying any vendor");
        models = await vscode.lm.selectChatModels({});
      }

      if (models.length === 0) {
        logger.logDebug("No language models available at all");
        return [];
      }

      logger.logDebug("Selected model", { 
        vendor: models[0].vendor, 
        family: models[0].family,
        name: models[0].name 
      });

      const model = models[0];

      // Build a concise prompt for completion
      // Keep context minimal to reduce latency
      const prompt = this.buildCompletionPrompt(context);

      logger.logDebug("Sending prompt to Copilot", {
        promptLength: prompt.length,
        promptPreview: prompt.substring(0, 200),
      });

      // Request completion from the model
      const messages: vscode.LanguageModelChatMessage[] = [
        vscode.LanguageModelChatMessage.User(prompt),
      ];

      const response = await model.sendRequest(
        messages,
        {},
        new vscode.CancellationTokenSource().token
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
    const { prefix, suffix, fileName } = context;

    logger.logDebug("Completion context", {
      prefixLength: prefix.length,
      suffixLength: suffix.length,
      cursorPos: context.cursorPos,
      mdContentLength: context.mdContent.length,
      prefixPreview: prefix.substring(Math.max(0, prefix.length - 50)),
    });

    // Limit context to reasonable size (last 500 chars)
    const contextSize = 500;
    const relevantPrefix =
      prefix.length > contextSize
        ? "..." + prefix.substring(prefix.length - contextSize)
        : prefix;

    return `You are a helpful markdown editor assistant. Continue the markdown text naturally.

File: ${fileName}

Current text:
${relevantPrefix}█${suffix}

Complete the text at the cursor (█) with a single sentence or phrase. 
Return ONLY the completion text, nothing else.
Keep it brief and relevant to the context.`;
  }

  /**
   * Parse the language model response into suggestions
   */
  private async parseResponse(
    response: vscode.LanguageModelChatResponse
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
          keys: Object.keys(textStream).slice(0, 5)
        });
        return [];
      }

      if (fullText.trim()) {
        logger.logDebug("Extracted text from stream", { 
          length: fullText.length,
          preview: fullText.substring(0, 100)
        });
        return [fullText.trim()];
      }

      return [];
    } catch (error) {
      logger.logDebug("Error parsing response", { 
        error: String(error),
        errorMessage: (error as any).message
      });
      return [];
    }
  }
}

