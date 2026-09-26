import {
  findAzureDevOpsReferences,
  parseAzureDevOpsOrganization,
  parseAzureDevOpsRemote,
} from "../common/azureDevOps";

const GUID = "6f1d3e0a-1b2c-4d5e-8f90-a1b2c3d4e5f6";

describe("findAzureDevOpsReferences", () => {
  test("finds work items and users with their offsets", () => {
    const text = `Fixes #123 for @<${GUID.toUpperCase()}>`;
    expect(findAzureDevOpsReferences(text)).toEqual([
      { kind: "workItem", id: 123, from: 6, to: 10 },
      { kind: "user", id: GUID, from: 15, to: text.length },
    ]);
  });

  test("finds a work item at the start of the text and before punctuation", () => {
    expect(findAzureDevOpsReferences("#1, (#22).").map((r) => r.id)).toEqual([
      1, 22,
    ]);
  });

  test.each([
    ["a url fragment", "page#123"],
    ["an html entity", "&#123;"],
    ["a word", "abc#123"],
    ["trailing letters", "#123abc"],
    ["a heading-like run", "##123"],
    ["a bare hash", "# 123"],
    ["a mention without a guid", "@<someone>"],
  ])("ignores %s", (_name, text) => {
    expect(findAzureDevOpsReferences(text)).toEqual([]);
  });
});

describe("parseAzureDevOpsRemote", () => {
  test.each([
    ["https://dev.azure.com/contoso/Project/_git/repo"],
    ["https://contoso@dev.azure.com/contoso/Project/_git/repo"],
    ["git@ssh.dev.azure.com:v3/contoso/Project/repo"],
    ["ssh://git@ssh.dev.azure.com/v3/contoso/Project/repo"],
    ["https://contoso.visualstudio.com/Project/_git/repo"],
    ["https://contoso.visualstudio.com/DefaultCollection/Project/_git/repo"],
    ["contoso@vs-ssh.visualstudio.com:v3/contoso/Project/repo"],
  ])("%s", (remote) => {
    expect(parseAzureDevOpsRemote(remote)).toEqual({
      name: "contoso",
      url: "https://dev.azure.com/contoso",
    });
  });

  test("ignores other hosts", () => {
    expect(
      parseAzureDevOpsRemote("https://github.com/contoso/repo.git")
    ).toBeUndefined();
  });
});

describe("parseAzureDevOpsOrganization", () => {
  test.each([["contoso"], ["https://dev.azure.com/contoso"], ["https://dev.azure.com/contoso/"]])(
    "%s",
    (setting) => {
      expect(parseAzureDevOpsOrganization(setting)).toEqual({
        name: "contoso",
        url: "https://dev.azure.com/contoso",
      });
    }
  );

  test("empty is unset", () => {
    expect(parseAzureDevOpsOrganization("  ")).toBeUndefined();
  });
});
