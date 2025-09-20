import { cleanFullResponse } from "@/ipc/utils/cleanFullResponse";
import { describe, it, expect } from "vitest";

describe("cleanFullResponse", () => {
  it("should replace < characters in man-write attributes", () => {
    const input = `<man-write path="src/file.tsx" description="Testing <a> tags.">content</man-write>`;
    const expected = `<man-write path="src/file.tsx" description="Testing ＜a＞ tags.">content</man-write>`;

    const result = cleanFullResponse(input);
    expect(result).toBe(expected);
  });

  it("should replace < characters in multiple attributes", () => {
    const input = `<man-write path="src/<component>.tsx" description="Testing <div> tags.">content</man-write>`;
    const expected = `<man-write path="src/＜component＞.tsx" description="Testing ＜div＞ tags.">content</man-write>`;

    const result = cleanFullResponse(input);
    expect(result).toBe(expected);
  });

  it("should handle multiple nested HTML tags in a single attribute", () => {
    const input = `<man-write path="src/file.tsx" description="Testing <div> and <span> and <a> tags.">content</man-write>`;
    const expected = `<man-write path="src/file.tsx" description="Testing ＜div＞ and ＜span＞ and ＜a＞ tags.">content</man-write>`;

    const result = cleanFullResponse(input);
    expect(result).toBe(expected);
  });

  it("should handle complex example with mixed content", () => {
    const input = `
      BEFORE TAG
  <man-write path="src/pages/locations/neighborhoods/louisville/Highlands.tsx" description="Updating Highlands neighborhood page to use <a> tags.">
import React from 'react';
</man-write>
AFTER TAG
    `;

    const expected = `
      BEFORE TAG
  <man-write path="src/pages/locations/neighborhoods/louisville/Highlands.tsx" description="Updating Highlands neighborhood page to use ＜a＞ tags.">
import React from 'react';
</man-write>
AFTER TAG
    `;

    const result = cleanFullResponse(input);
    expect(result).toBe(expected);
  });

  it("should handle other man tag types", () => {
    const input = `<man-rename from="src/<old>.tsx" to="src/<new>.tsx"></man-rename>`;
    const expected = `<man-rename from="src/＜old＞.tsx" to="src/＜new＞.tsx"></man-rename>`;

    const result = cleanFullResponse(input);
    expect(result).toBe(expected);
  });

  it("should handle man-delete tags", () => {
    const input = `<man-delete path="src/<component>.tsx"></man-delete>`;
    const expected = `<man-delete path="src/＜component＞.tsx"></man-delete>`;

    const result = cleanFullResponse(input);
    expect(result).toBe(expected);
  });

  it("should not affect content outside man tags", () => {
    const input = `Some text with <regular> HTML tags. <man-write path="test.tsx" description="With <nested> tags.">content</man-write> More <html> here.`;
    const expected = `Some text with <regular> HTML tags. <man-write path="test.tsx" description="With ＜nested＞ tags.">content</man-write> More <html> here.`;

    const result = cleanFullResponse(input);
    expect(result).toBe(expected);
  });

  it("should handle empty attributes", () => {
    const input = `<man-write path="src/file.tsx">content</man-write>`;
    const expected = `<man-write path="src/file.tsx">content</man-write>`;

    const result = cleanFullResponse(input);
    expect(result).toBe(expected);
  });

  it("should handle attributes without < characters", () => {
    const input = `<man-write path="src/file.tsx" description="Normal description">content</man-write>`;
    const expected = `<man-write path="src/file.tsx" description="Normal description">content</man-write>`;

    const result = cleanFullResponse(input);
    expect(result).toBe(expected);
  });
});
