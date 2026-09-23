import {
  getNonce,
  markdownToOutline,
  outlineToMarkdown,
  extractFrontmatter,
  restoreFrontmatter,
  debounce,
} from "../client/utils/utils"

import { FIXTURES } from "./fixtures"

for (const name in FIXTURES) {
  const content = FIXTURES[name]
  it(`"${name}" markdown should convert to outline and back`, () => {
    expect(outlineToMarkdown(markdownToOutline(content))).toEqual(content)
  })
}

it("generates a reasonable nonce", () => {
  const nonce = getNonce()
  expect(nonce.length).toBe(32)
})

describe("extractFrontmatter", () => {
  it("extracts YAML frontmatter and body", () => {
    const md = "---\nname: test\ndescription: asdf\n---\n\nHello world\n"
    const { frontmatter, body } = extractFrontmatter(md)
    expect(frontmatter).toBe("---\nname: test\ndescription: asdf\n---\n")
    expect(body).toBe("\nHello world\n")
  })

  it("returns empty frontmatter when none present", () => {
    const md = "# Title\n\nSome text\n"
    const { frontmatter, body } = extractFrontmatter(md)
    expect(frontmatter).toBe("")
    expect(body).toBe(md)
  })

  it("does not match --- in the middle of content", () => {
    const md = "Some text\n---\nMore text\n"
    const { frontmatter, body } = extractFrontmatter(md)
    expect(frontmatter).toBe("")
    expect(body).toBe(md)
  })

  it("handles frontmatter with no trailing content", () => {
    const md = "---\nkey: value\n---\n"
    const { frontmatter, body } = extractFrontmatter(md)
    expect(frontmatter).toBe("---\nkey: value\n---\n")
    expect(body).toBe("")
  })

  it("handles Windows-style line endings", () => {
    const md = "---\r\nname: test\r\n---\r\n\r\nBody\r\n"
    const { frontmatter, body } = extractFrontmatter(md)
    expect(frontmatter).toBe("---\r\nname: test\r\n---\r\n")
    expect(body).toBe("\r\nBody\r\n")
  })
})

describe("restoreFrontmatter", () => {
  it("prepends frontmatter to body", () => {
    const fm = "---\nname: test\n---\n"
    const body = "\nHello world\n"
    expect(restoreFrontmatter(fm, body)).toBe("---\nname: test\n---\n\nHello world\n")
  })

  it("returns body unchanged when frontmatter is empty", () => {
    expect(restoreFrontmatter("", "# Title\n")).toBe("# Title\n")
  })
})

describe("debounce", () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  test("pending() reports a call still waiting on the timeout", () => {
    const fn = jest.fn()
    const debounced = debounce(fn, 200)
    expect(debounced.pending()).toBe(false)

    debounced()
    expect(debounced.pending()).toBe(true)

    jest.advanceTimersByTime(200)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(debounced.pending()).toBe(false)
  })

  test("flush() runs the waiting call and clears pending()", () => {
    const fn = jest.fn()
    const debounced = debounce(fn, 200)
    debounced.call({}, "x")
    debounced.flush()
    expect(fn).toHaveBeenCalledWith("x")
    expect(debounced.pending()).toBe(false)
  })
})
