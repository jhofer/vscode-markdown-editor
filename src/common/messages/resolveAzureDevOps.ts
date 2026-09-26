import { IMessageFactory } from "./messages";
import { UserInfo, WorkItemInfo } from "../azureDevOps";

const requestType = "resolveAzureDevOps-request";
const responseType = "resolveAzureDevOps-response";
const errorType = "resolveAzureDevOps-error";

/**
 * Lookup results keyed by work item id / user GUID. `null` means the lookup
 * ran and found nothing (unknown id, no access), so the client stops asking.
 */
export type ResolveAzureDevOpsResponsePayload = {
  workItems: Record<string, WorkItemInfo | null>;
  users: Record<string, UserInfo | null>;
};

const resolveAzureDevOpsRequest = (workItemIds: number[], userIds: string[]) => ({
  type: requestType,
  payload: {
    workItemIds,
    userIds,
  },
});

const resolveAzureDevOpsResponse = (
  payload: ResolveAzureDevOpsResponsePayload
) => ({
  type: responseType,
  payload,
});

const resolveAzureDevOpsError = (error: string) => ({
  type: errorType,
  payload: error,
});

export const resolveAzureDevOpsMessage: IMessageFactory<
  Parameters<typeof resolveAzureDevOpsRequest>,
  Parameters<typeof resolveAzureDevOpsResponse>,
  Parameters<typeof resolveAzureDevOpsError>,
  ReturnType<typeof resolveAzureDevOpsRequest>,
  ReturnType<typeof resolveAzureDevOpsResponse>,
  ReturnType<typeof resolveAzureDevOpsError>
> = {
  requestType,
  responseType,
  errorType,
  request: resolveAzureDevOpsRequest,
  response: resolveAzureDevOpsResponse,
  error: resolveAzureDevOpsError,
};
