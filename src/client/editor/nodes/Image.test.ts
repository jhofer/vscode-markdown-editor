import { isSmallImage, SMALL_IMAGE_MAX_SIZE } from "./Image";

describe("isSmallImage", () => {
  it("treats icon-sized images as small", () => {
    expect(isSmallImage(16, 16)).toBe(true);
    expect(isSmallImage(SMALL_IMAGE_MAX_SIZE, SMALL_IMAGE_MAX_SIZE)).toBe(true);
  });

  it("treats images larger in either direction as large", () => {
    expect(isSmallImage(SMALL_IMAGE_MAX_SIZE + 1, 20)).toBe(false);
    expect(isSmallImage(20, SMALL_IMAGE_MAX_SIZE + 1)).toBe(false);
  });

  it("does not treat an unknown size as small", () => {
    expect(isSmallImage(0, 0)).toBe(false);
  });
});
