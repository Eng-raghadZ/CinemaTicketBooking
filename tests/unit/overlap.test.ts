import { describe, expect, it } from "vitest";
import {
  computeShowtimeWindow,
  windowsOverlap,
  findOverlappingShowtimeId,
  SHOWTIME_BUFFER_MINUTES,
} from "@/lib/catalog/overlap";

describe("computeShowtimeWindow", () => {
  it("adds the movie duration plus the changeover buffer", () => {
    const startsAt = new Date("2026-01-01T18:00:00Z");
    const window = computeShowtimeWindow({ startsAt, durationMinutes: 120 });
    const expectedEnd = new Date(
      startsAt.getTime() + (120 + SHOWTIME_BUFFER_MINUTES) * 60 * 1000,
    );
    expect(window.start).toEqual(startsAt);
    expect(window.end).toEqual(expectedEnd);
  });

  it("respects a custom buffer override", () => {
    const startsAt = new Date("2026-01-01T18:00:00Z");
    const window = computeShowtimeWindow({ startsAt, durationMinutes: 90, bufferMinutes: 0 });
    expect(window.end).toEqual(new Date(startsAt.getTime() + 90 * 60 * 1000));
  });
});

describe("windowsOverlap", () => {
  it("detects overlapping windows", () => {
    const a = { start: new Date("2026-01-01T18:00:00Z"), end: new Date("2026-01-01T20:00:00Z") };
    const b = { start: new Date("2026-01-01T19:00:00Z"), end: new Date("2026-01-01T21:00:00Z") };
    expect(windowsOverlap(a, b)).toBe(true);
  });

  it("does not flag back-to-back, non-overlapping windows as overlapping", () => {
    const a = { start: new Date("2026-01-01T18:00:00Z"), end: new Date("2026-01-01T20:00:00Z") };
    const b = { start: new Date("2026-01-01T20:00:00Z"), end: new Date("2026-01-01T22:00:00Z") };
    expect(windowsOverlap(a, b)).toBe(false);
  });

  it("does not flag clearly separate windows", () => {
    const a = { start: new Date("2026-01-01T18:00:00Z"), end: new Date("2026-01-01T19:00:00Z") };
    const b = { start: new Date("2026-01-01T22:00:00Z"), end: new Date("2026-01-01T23:00:00Z") };
    expect(windowsOverlap(a, b)).toBe(false);
  });
});

describe("findOverlappingShowtimeId", () => {
  const existingShowtimes = [
    { id: "st-1", startsAt: new Date("2026-01-01T18:00:00Z"), durationMinutes: 120 },
    { id: "st-2", startsAt: new Date("2026-01-01T22:00:00Z"), durationMinutes: 90 },
  ];

  it("returns null when the candidate does not conflict with anything", () => {
    const conflict = findOverlappingShowtimeId({
      candidateStartsAt: new Date("2026-01-02T10:00:00Z"),
      candidateDurationMinutes: 100,
      existingShowtimes,
    });
    expect(conflict).toBeNull();
  });

  it("returns the conflicting showtime id when within the buffer window", () => {
    // st-1 occupies 18:00 to 20:15 (120min + 15min buffer). A candidate at
    // 20:10 collides even though the raw movie runtime alone wouldn't.
    const conflict = findOverlappingShowtimeId({
      candidateStartsAt: new Date("2026-01-01T20:10:00Z"),
      candidateDurationMinutes: 90,
      existingShowtimes,
    });
    expect(conflict).toBe("st-1");
  });

  it("does not conflict with itself when excludeShowtimeId is set", () => {
    const conflict = findOverlappingShowtimeId({
      candidateStartsAt: new Date("2026-01-01T18:00:00Z"),
      candidateDurationMinutes: 120,
      existingShowtimes,
      excludeShowtimeId: "st-1",
    });
    expect(conflict).toBeNull();
  });

  it("fits cleanly in the gap between two showtimes once the buffer is respected", () => {
    // st-1 ends (incl. buffer) at 20:15. st-2 starts at 22:00.
    // A 90-minute showtime starting at 20:15 ends (incl. buffer) at 21:45 — no conflict.
    const conflict = findOverlappingShowtimeId({
      candidateStartsAt: new Date("2026-01-01T20:15:00Z"),
      candidateDurationMinutes: 90,
      existingShowtimes,
    });
    expect(conflict).toBeNull();
  });
});
