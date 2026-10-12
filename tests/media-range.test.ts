import { expect, it } from "vitest";
import { mediaRange } from "../src/lib/media-range";

it("serves browser byte ranges, open ends and suffixes within the media", () => {
  expect(mediaRange("bytes=100-199", 1000)).toEqual({ start: 100, end: 199 });
  expect(mediaRange("bytes=900-", 1000)).toEqual({ start: 900, end: 999 });
  expect(mediaRange("bytes=900-2000", 1000)).toEqual({ start: 900, end: 999 });
  expect(mediaRange("bytes=-200", 1000)).toEqual({ start: 800, end: 999 });
  expect(mediaRange("bytes=-2000", 1000)).toEqual({ start: 0, end: 999 });
});

it("rejects invalid or unsatisfiable ranges", () => {
  for (const header of ["bytes=1000-", "bytes=-0", "bytes=200-100", "bytes=-", "bytes=0-1,4-5", "invalid", "bytes=9007199254740992-"]) expect(mediaRange(header, 1000)).toBeNull();
  expect(mediaRange("bytes=0-", 0)).toBeNull();
});
