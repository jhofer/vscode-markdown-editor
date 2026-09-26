import { UserInfo, WorkItemInfo } from "../../../common/azureDevOps";
import { ResolveAzureDevOpsResponsePayload } from "../../../common/messages/resolveAzureDevOps";

type Listener = () => void;

/** Collects references typed in quick succession (`#1`, `#12`, `#123`) into one lookup. */
const REQUEST_DELAY_MS = 400;

/**
 * Client-side cache of the Azure DevOps work items and users referenced by the
 * document. Lives outside the editor (in EditorHost) so it survives the editor
 * being re-created. Lookups are batched and sent to the host through
 * `request`; answers come back through `merge`.
 *
 * A value of `undefined` means "not looked up yet", `null` means "looked up,
 * nothing found".
 */
export class AzureDevOpsStore {
  readonly workItems = new Map<number, WorkItemInfo | null>();
  readonly users = new Map<string, UserInfo | null>();
  private requestedWorkItems = new Set<number>();
  private requestedUsers = new Set<string>();
  private listeners = new Set<Listener>();
  private pendingWorkItems = new Set<number>();
  private pendingUsers = new Set<string>();
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly request: (workItemIds: number[], userIds: string[]) => void
  ) {}

  /** Asks the host for any of these that haven't been requested before. */
  ensure(workItemIds: Iterable<number>, userIds: Iterable<string>) {
    for (const id of workItemIds) {
      if (!this.requestedWorkItems.has(id)) {
        this.pendingWorkItems.add(id);
      }
    }
    for (const id of userIds) {
      if (!this.requestedUsers.has(id)) {
        this.pendingUsers.add(id);
      }
    }
    if (
      this.timer === undefined &&
      (this.pendingWorkItems.size > 0 || this.pendingUsers.size > 0)
    ) {
      this.timer = setTimeout(() => this.flush(), REQUEST_DELAY_MS);
    }
  }

  private flush() {
    this.timer = undefined;
    const workItemIds = [...this.pendingWorkItems];
    const userIds = [...this.pendingUsers];
    this.pendingWorkItems.clear();
    this.pendingUsers.clear();
    workItemIds.forEach((id) => this.requestedWorkItems.add(id));
    userIds.forEach((id) => this.requestedUsers.add(id));
    if (workItemIds.length > 0 || userIds.length > 0) {
      this.request(workItemIds, userIds);
    }
  }

  merge(payload: ResolveAzureDevOpsResponsePayload) {
    let changed = false;
    for (const [id, info] of Object.entries(payload.workItems ?? {})) {
      this.workItems.set(Number(id), info);
      changed = true;
    }
    for (const [id, info] of Object.entries(payload.users ?? {})) {
      this.users.set(id.toLowerCase(), info);
      changed = true;
    }
    if (changed) {
      this.listeners.forEach((listener) => listener());
    }
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}
