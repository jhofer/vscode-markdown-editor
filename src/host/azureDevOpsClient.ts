import * as vscode from "vscode";
import * as fs from "fs";
import path from "path";
import logger from "./logger";
import {
  AzureDevOpsOrganization,
  UserInfo,
  WorkItemInfo,
  parseAzureDevOpsOrganization,
  parseAzureDevOpsRemote,
} from "../common/azureDevOps";
import { ResolveAzureDevOpsResponsePayload } from "../common/messages/resolveAzureDevOps";

/** How long a looked-up work item is reused before asking again (its state may change). */
const WORK_ITEM_TTL_MS = 5 * 60 * 1000;
/** The work items API accepts at most 200 ids per request. */
const MAX_IDS_PER_REQUEST = 200;
const API_VERSION = "7.0";

type Cached<T> = { value: T | null; expires: number };

type WorkItemType = {
  color?: string;
  states: Record<string, string | undefined>;
};

/**
 * Reads the Azure DevOps personal access token from the user settings.
 */
export function getAzureDevOpsPat(): string {
  return (
    vscode.workspace
      .getConfiguration("inkwell-md")
      .get<string>("azureDevOps.personalAccessToken", "") ?? ""
  ).trim();
}

/**
 * Looks up Azure DevOps work items and users referenced from a wiki page
 * (see common/azureDevOps.ts), authenticating with the personal access token
 * from the user settings.
 */
export class AzureDevOpsClient {
  private workItems = new Map<string, Cached<WorkItemInfo>>();
  private users = new Map<string, Cached<UserInfo>>();
  private workItemTypes = new Map<string, Promise<Map<string, WorkItemType>>>();
  private reportedAuthFailure = false;

  /** Drops everything cached, e.g. after the token or organization setting changed. */
  clear() {
    this.workItems.clear();
    this.users.clear();
    this.workItemTypes.clear();
    this.reportedAuthFailure = false;
  }

  /**
   * The organization to query: the `inkwell-md.azureDevOps.organization`
   * setting, or else the one the document's git repository was cloned from.
   */
  resolveOrganization(
    repositoryRoot: string | undefined
  ): AzureDevOpsOrganization | undefined {
    const setting = vscode.workspace
      .getConfiguration("inkwell-md")
      .get<string>("azureDevOps.organization", "");
    const configured = setting ? parseAzureDevOpsOrganization(setting) : undefined;
    if (configured) {
      return configured;
    }
    if (!repositoryRoot) {
      return undefined;
    }
    for (const remote of readGitRemotes(repositoryRoot)) {
      const organization = parseAzureDevOpsRemote(remote);
      if (organization) {
        return organization;
      }
    }
    return undefined;
  }

  async resolve(
    organization: AzureDevOpsOrganization,
    workItemIds: number[],
    userIds: string[]
  ): Promise<ResolveAzureDevOpsResponsePayload> {
    const pat = getAzureDevOpsPat();
    const result: ResolveAzureDevOpsResponsePayload = { workItems: {}, users: {} };
    if (!pat) {
      return result;
    }
    const [workItems, users] = await Promise.all([
      this.resolveWorkItems(organization, pat, workItemIds),
      this.resolveUsers(organization, pat, userIds),
    ]);
    result.workItems = workItems;
    result.users = users;
    return result;
  }

  private async resolveWorkItems(
    organization: AzureDevOpsOrganization,
    pat: string,
    ids: number[]
  ): Promise<Record<string, WorkItemInfo | null>> {
    const result: Record<string, WorkItemInfo | null> = {};
    const now = Date.now();
    const missing: number[] = [];
    for (const id of new Set(ids)) {
      const cached = this.workItems.get(`${organization.url}|${id}`);
      if (cached && cached.expires > now) {
        result[id] = cached.value;
      } else {
        missing.push(id);
      }
    }

    for (let i = 0; i < missing.length; i += MAX_IDS_PER_REQUEST) {
      const batch = missing.slice(i, i + MAX_IDS_PER_REQUEST);
      const fields = [
        "System.Title",
        "System.State",
        "System.WorkItemType",
        "System.TeamProject",
      ].join(",");
      const url =
        `${organization.url}/_apis/wit/workitems?ids=${batch.join(",")}` +
        `&fields=${fields}&errorPolicy=omit&api-version=${API_VERSION}`;
      const response = await this.get<{
        value: Array<{ id: number; fields: Record<string, string> } | null>;
      }>(url, pat);
      if (!response) {
        // Network or auth failure: leave these unresolved so they are retried
        // on a later request rather than cached as "not found".
        continue;
      }

      const found = new Map<number, WorkItemInfo>();
      for (const item of response.value ?? []) {
        if (!item) {
          continue;
        }
        const project = item.fields["System.TeamProject"];
        const type = item.fields["System.WorkItemType"];
        const state = item.fields["System.State"];
        const types = project
          ? await this.getWorkItemTypes(organization, pat, project)
          : undefined;
        const typeInfo = types?.get(type);
        found.set(item.id, {
          id: item.id,
          title: item.fields["System.Title"] ?? "",
          type,
          state,
          typeColor: typeInfo?.color,
          stateColor: typeInfo?.states[state],
          url: project
            ? `${organization.url}/${encodeURIComponent(project)}/_workitems/edit/${item.id}`
            : `${organization.url}/_workitems/edit/${item.id}`,
        });
      }

      for (const id of batch) {
        const value = found.get(id) ?? null;
        this.workItems.set(`${organization.url}|${id}`, {
          value,
          expires: now + WORK_ITEM_TTL_MS,
        });
        result[id] = value;
      }
    }
    return result;
  }

  private getWorkItemTypes(
    organization: AzureDevOpsOrganization,
    pat: string,
    project: string
  ): Promise<Map<string, WorkItemType>> {
    const key = `${organization.url}|${project}`;
    let types = this.workItemTypes.get(key);
    if (!types) {
      const url = `${organization.url}/${encodeURIComponent(project)}/_apis/wit/workitemtypes?api-version=${API_VERSION}`;
      types = this.get<{
        value: Array<{
          name: string;
          color?: string;
          states?: Array<{ name: string; color?: string }>;
        }>;
      }>(url, pat).then((response) => {
        const map = new Map<string, WorkItemType>();
        for (const type of response?.value ?? []) {
          const states: Record<string, string | undefined> = {};
          for (const state of type.states ?? []) {
            states[state.name] = state.color;
          }
          map.set(type.name, { color: type.color, states });
        }
        if (!response) {
          // Don't remember a failed lookup; try again next time.
          this.workItemTypes.delete(key);
        }
        return map;
      });
      this.workItemTypes.set(key, types);
    }
    return types;
  }

  private async resolveUsers(
    organization: AzureDevOpsOrganization,
    pat: string,
    ids: string[]
  ): Promise<Record<string, UserInfo | null>> {
    const result: Record<string, UserInfo | null> = {};
    const missing: string[] = [];
    for (const id of new Set(ids.map((id) => id.toLowerCase()))) {
      const cached = this.users.get(`${organization.url}|${id}`);
      if (cached) {
        result[id] = cached.value;
      } else {
        missing.push(id);
      }
    }
    if (missing.length === 0) {
      return result;
    }

    const url = `https://vssps.dev.azure.com/${encodeURIComponent(
      organization.name
    )}/_apis/identities?identityIds=${missing.join(",")}&api-version=${API_VERSION}`;
    const response = await this.get<{
      value: Array<{
        id: string;
        providerDisplayName?: string;
        customDisplayName?: string;
      } | null>;
    }>(url, pat);
    if (!response) {
      return result;
    }

    const found = new Map<string, UserInfo>();
    for (const identity of response.value ?? []) {
      if (!identity?.id) {
        continue;
      }
      const displayName =
        identity.customDisplayName || identity.providerDisplayName;
      if (displayName) {
        const id = identity.id.toLowerCase();
        found.set(id, { id, displayName });
      }
    }
    for (const id of missing) {
      const value = found.get(id) ?? null;
      this.users.set(`${organization.url}|${id}`, {
        value,
        expires: Number.POSITIVE_INFINITY,
      });
      result[id] = value;
    }
    return result;
  }

  private async get<T>(url: string, pat: string): Promise<T | undefined> {
    try {
      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          Authorization: `Basic ${Buffer.from(`:${pat}`).toString("base64")}`,
        },
        // Azure DevOps may answer an invalid token with a redirect to its
        // sign-in page (or a 203 carrying it) rather than a 401.
        redirect: "manual",
      });
      if (!response.ok || response.status === 203) {
        this.reportFailure(response.status);
        return undefined;
      }
      return (await response.json()) as T;
    } catch (error) {
      logger.logError(error);
      return undefined;
    }
  }

  private reportFailure(status: number) {
    logger.logDebug("Azure DevOps request failed", { status });
    const isAuthFailure =
      status === 0 || status === 203 || status === 401 || status === 403 || (status >= 300 && status < 400);
    if (isAuthFailure && !this.reportedAuthFailure) {
      this.reportedAuthFailure = true;
      vscode.window.showWarningMessage(
        "inkwell.md: Azure DevOps rejected the personal access token. Check `inkwell-md.azureDevOps.personalAccessToken` (it needs the Work Items (Read) and Identity (Read) scopes)."
      );
    }
  }
}

/**
 * The remote URLs from a repository's git config. Handles worktrees and
 * submodules, whose `.git` is a file pointing at the real git directory.
 */
export function readGitRemotes(repositoryRoot: string): string[] {
  try {
    let gitDir = path.join(repositoryRoot, ".git");
    if (fs.statSync(gitDir).isFile()) {
      const pointer = /^gitdir:\s*(.+)$/m.exec(fs.readFileSync(gitDir, "utf8"));
      if (!pointer) {
        return [];
      }
      gitDir = path.resolve(repositoryRoot, pointer[1].trim());
      const commonDirFile = path.join(gitDir, "commondir");
      if (fs.existsSync(commonDirFile)) {
        gitDir = path.resolve(gitDir, fs.readFileSync(commonDirFile, "utf8").trim());
      }
    }
    const config = fs.readFileSync(path.join(gitDir, "config"), "utf8");
    return Array.from(config.matchAll(/^\s*url\s*=\s*(.+)$/gm), (m) => m[1].trim());
  } catch {
    return [];
  }
}
