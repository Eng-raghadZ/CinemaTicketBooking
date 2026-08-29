/**
 * Pure, DB-free seat-grid generation for Phase 2 (Catalog Management).
 *
 * Deliberately has zero dependencies on Supabase/Drizzle so it's unit
 * testable and reusable both server-side (createScreen action) and,
 * later, client-side for a live preview if one is ever added.
 *
 * Row labeling is spreadsheet-style (A, B, ... Z, AA, AB, ... AZ, BA, ...),
 * which is the standard bijective base-26 numeral system Excel/Sheets use
 * for columns. This is what lets a screen exceed 26 rows without any
 * special-casing at the call site — row 27 is simply "AA".
 *
 * The generation *inputs* (rows, seatsPerRow, seatType) are what get
 * persisted in `screens.layout_config` jsonb (see lib/actions/screens.ts),
 * not the derived seat list itself — this is what the architecture notes
 * mean by "layout_config stores inputs for future extension without
 * requiring a migration": a future richer layout (e.g. per-row seat types,
 * aisles, curved rows) is an additive change to what's stored in this one
 * jsonb column, not a new table or migration.
 */

export const SEAT_TYPES = ["standard", "premium", "accessible"] as const;
export type SeatType = (typeof SEAT_TYPES)[number];

export const MIN_ROWS = 1;
export const MAX_ROWS = 60;
export const MIN_SEATS_PER_ROW = 1;
export const MAX_SEATS_PER_ROW = 60;

export interface SeatLayoutInput {
  rows: number;
  seatsPerRow: number;
  seatType: SeatType;
}

export interface GeneratedSeat {
  row: string;
  number: number;
  seatType: SeatType;
}

/**
 * Converts a 0-based row index into a spreadsheet-style label.
 * 0 -> "A", 25 -> "Z", 26 -> "AA", 27 -> "AB", 51 -> "AZ", 52 -> "BA", ...
 */
export function rowLabelForIndex(index: number): string {
  if (!Number.isInteger(index) || index < 0) {
    throw new RangeError(`rowLabelForIndex: index must be a non-negative integer, got ${index}`);
  }

  let n = index + 1; // shift to 1-based for the bijective base-26 algorithm
  let label = "";

  while (n > 0) {
    const remainder = (n - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    n = Math.floor((n - 1) / 26);
  }

  return label;
}

/**
 * Generates a full, uniform seat grid for a screen: `rows` rows of
 * `seatsPerRow` seats each, all of the same `seatType`. Seat numbers within
 * a row are 1-indexed, matching how a customer-facing seat map would label
 * them (row A, seat 1..N) — this mirrors the (row, number) shape of the
 * `seats` table exactly, so the output can be inserted as-is.
 */
export function generateSeatGrid(input: SeatLayoutInput): GeneratedSeat[] {
  const { rows, seatsPerRow, seatType } = input;

  if (!Number.isInteger(rows) || rows < MIN_ROWS || rows > MAX_ROWS) {
    throw new RangeError(`generateSeatGrid: rows must be an integer between ${MIN_ROWS} and ${MAX_ROWS}`);
  }
  if (
    !Number.isInteger(seatsPerRow) ||
    seatsPerRow < MIN_SEATS_PER_ROW ||
    seatsPerRow > MAX_SEATS_PER_ROW
  ) {
    throw new RangeError(
      `generateSeatGrid: seatsPerRow must be an integer between ${MIN_SEATS_PER_ROW} and ${MAX_SEATS_PER_ROW}`,
    );
  }

  const seats: GeneratedSeat[] = [];
  for (let rowIndex = 0; rowIndex < rows; rowIndex++) {
    const rowLabel = rowLabelForIndex(rowIndex);
    for (let seatNumber = 1; seatNumber <= seatsPerRow; seatNumber++) {
      seats.push({ row: rowLabel, number: seatNumber, seatType });
    }
  }
  return seats;
}
