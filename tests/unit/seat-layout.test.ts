import { describe, expect, it } from "vitest";
import { rowLabelForIndex, generateSeatGrid } from "@/lib/catalog/seat-layout";

describe("rowLabelForIndex", () => {
  it("labels the first 26 rows A through Z", () => {
    expect(rowLabelForIndex(0)).toBe("A");
    expect(rowLabelForIndex(1)).toBe("B");
    expect(rowLabelForIndex(25)).toBe("Z");
  });

  it("rolls over to AA after Z, matching spreadsheet column naming", () => {
    expect(rowLabelForIndex(26)).toBe("AA");
    expect(rowLabelForIndex(27)).toBe("AB");
    expect(rowLabelForIndex(51)).toBe("AZ");
    expect(rowLabelForIndex(52)).toBe("BA");
  });

  it("handles a screen with more than 26 rows without collision", () => {
    const labels = Array.from({ length: 60 }, (_, i) => rowLabelForIndex(i));
    expect(new Set(labels).size).toBe(60);
    expect(labels[59]).toBe("BH");
  });

  it("rejects a negative or non-integer index", () => {
    expect(() => rowLabelForIndex(-1)).toThrow(RangeError);
    expect(() => rowLabelForIndex(1.5)).toThrow(RangeError);
  });
});

describe("generateSeatGrid", () => {
  it("generates rows x seatsPerRow seats with 1-indexed seat numbers", () => {
    const seats = generateSeatGrid({ rows: 2, seatsPerRow: 3, seatType: "standard" });
    expect(seats).toHaveLength(6);
    expect(seats[0]).toEqual({ row: "A", number: 1, seatType: "standard" });
    expect(seats[2]).toEqual({ row: "A", number: 3, seatType: "standard" });
    expect(seats[3]).toEqual({ row: "B", number: 1, seatType: "standard" });
  });

  it("applies the given seat type uniformly", () => {
    const seats = generateSeatGrid({ rows: 1, seatsPerRow: 2, seatType: "premium" });
    expect(seats.every((s) => s.seatType === "premium")).toBe(true);
  });

  it("produces no duplicate (row, number) pairs for a large grid", () => {
    const seats = generateSeatGrid({ rows: 30, seatsPerRow: 20, seatType: "standard" });
    const keys = new Set(seats.map((s) => `${s.row}-${s.number}`));
    expect(keys.size).toBe(seats.length);
    expect(seats.length).toBe(600);
  });

  it("rejects rows or seatsPerRow outside bounds", () => {
    expect(() => generateSeatGrid({ rows: 0, seatsPerRow: 10, seatType: "standard" })).toThrow(
      RangeError,
    );
    expect(() => generateSeatGrid({ rows: 10, seatsPerRow: 0, seatType: "standard" })).toThrow(
      RangeError,
    );
    expect(() => generateSeatGrid({ rows: 61, seatsPerRow: 10, seatType: "standard" })).toThrow(
      RangeError,
    );
  });
});
