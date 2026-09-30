/**
 * Azure DevOps wiki references, shared by the host (which looks them up) and
 * the webview (which finds and renders them).
 *
 * Azure DevOps wikis store two kinds of references as plain markdown text:
 *
 * - work items as `#123`, rendered as a link showing the item's type, title
 *   and state. Links to a work item (`https://dev.azure.com/org/project/_workitems/edit/123`,
 *   bare or as a markdown link) are rendered the same way;
 * - people as `@<6f1d3e0a-...>` (the identity's GUID), rendered as
 *   `@Display Name`.
 */

export type WorkItemInfo = {
  id: number;
  title: string;
  /** e.g. "Bug", "User Story". */
  type: string;
  state: string;
  /** Hex colour of the work item type, without `#`. */
  typeColor?: string;
  /** Hex colour of the state, without `#`. */
  stateColor?: string;
  /** Web URL of the work item. */
  url: string;
};

export type UserInfo = {
  id: string;
  displayName: string;
};

export type AzureDevOpsReference =
  | {
      kind: "workItem";
      id: number;
      from: number;
      to: number;
      /**
       * Lower-case organization name, when the reference is a link to the
       * work item: it is only rendered if it's the organization looked up in.
       */
      organization?: string;
    }
  | { kind: "user"; id: string; from: number; to: number };

const GUID = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";

// `#123` only when it stands on its own: not part of a word, a URL fragment
// (`page#12`), an HTML entity (`&#123;`) or a run of hashes, and not followed
// by more word characters (`#12abc`).
const WORK_ITEM = "(?<![\\w&/#])#(\\d{1,9})(?![\\w#])";
const USER = `@<(${GUID})>`;
// A work item's web URL on `dev.azure.com/{org}` or `{org}.visualstudio.com`,
// with up to two path segments (collection, project) before `_workitems/edit/{id}`,
// optionally followed by a slash, query or fragment.
const WORK_ITEM_URL =
  "https?://(?:[^@/\\s]+@)?(?:dev\\.azure\\.com/([^/\\s?#]+)|([^./@\\s]+)\\.visualstudio\\.com)" +
  "(?:/[^/\\s?#]+){0,2}/_workitems/edit/(\\d{1,9})(?![\\w])/?(?:[?#][^\\s<>]*)?";

function organizationName(encoded: string): string {
  try {
    return decodeURIComponent(encoded).toLowerCase();
  } catch {
    return encoded.toLowerCase();
  }
}

/**
 * The work item a link points to, if `href` is the web URL of an Azure DevOps
 * work item.
 */
export function parseWorkItemUrl(
  href: string
): { organization: string; id: number } | undefined {
  const match = new RegExp(`^${WORK_ITEM_URL}$`, "i").exec(href.trim());
  if (!match) {
    return undefined;
  }
  return {
    organization: organizationName(match[1] ?? match[2]),
    id: Number(match[3]),
  };
}

/** Finds the work item and user references in a run of plain text. */
export function findAzureDevOpsReferences(
  text: string
): AzureDevOpsReference[] {
  const pattern = new RegExp(`${WORK_ITEM_URL}|${WORK_ITEM}|${USER}`, "gi");
  const references: AzureDevOpsReference[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    const from = match.index;
    const to = from + match[0].length;
    if (match[3] !== undefined) {
      references.push({
        kind: "workItem",
        id: Number(match[3]),
        from,
        to,
        organization: organizationName(match[1] ?? match[2]),
      });
    } else if (match[4] !== undefined) {
      references.push({ kind: "workItem", id: Number(match[4]), from, to });
    } else {
      references.push({ kind: "user", id: match[5].toLowerCase(), from, to });
    }
  }
  return references;
}

export type AzureDevOpsOrganization = {
  /** Organization name, e.g. "contoso". */
  name: string;
  /** Organization base URL without trailing slash, e.g. "https://dev.azure.com/contoso". */
  url: string;
};

/**
 * Derives the organization from an Azure DevOps git remote URL. Supports the
 * `dev.azure.com` (https and ssh) and legacy `*.visualstudio.com` forms.
 */
export function parseAzureDevOpsRemote(
  remote: string
): AzureDevOpsOrganization | undefined {
  const value = remote.trim();
  const match =
    /^https?:\/\/(?:[^@/]+@)?dev\.azure\.com\/([^/]+)\//i.exec(value) ||
    /ssh\.dev\.azure\.com[:/](?:22\/)?v3\/([^/]+)\//i.exec(value) ||
    /^https?:\/\/(?:[^@/]+@)?([^./@]+)\.visualstudio\.com\//i.exec(value) ||
    /vs-ssh\.visualstudio\.com[:/](?:22\/)?v3\/([^/]+)\//i.exec(value);
  if (match) {
    const name = decodeURIComponent(match[1]);
    return { name, url: `https://dev.azure.com/${encodeURIComponent(name)}` };
  }
  return undefined;
}

/**
 * Normalizes the `inkwell-md.azureDevOps.organization` setting, which accepts
 * either a bare organization name or its URL.
 */
export function parseAzureDevOpsOrganization(
  setting: string
): AzureDevOpsOrganization | undefined {
  const value = setting.trim().replace(/\/+$/, "");
  if (!value) {
    return undefined;
  }
  const fromUrl = parseAzureDevOpsRemote(`${value}/`);
  if (fromUrl) {
    return fromUrl;
  }
  if (/^[^/\s:]+$/.test(value)) {
    return { name: value, url: `https://dev.azure.com/${encodeURIComponent(value)}` };
  }
  return undefined;
}
