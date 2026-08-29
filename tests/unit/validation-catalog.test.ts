import { describe, expect, it } from "vitest";
import {
  movieSchema,
  updateMovieSchema,
  cinemaMovieSchema,
  createScreenSchema,
  createShowtimeSchema,
  updateShowtimePriceSchema,
} from "@/lib/validation/catalog";

const CINEMA_ID = "00000000-0000-0000-0000-000000000001";
const SCREEN_ID = "00000000-0000-0000-0000-000000000002";
const MOVIE_ID = "00000000-0000-0000-0000-000000000003";
const SHOWTIME_ID = "00000000-0000-0000-0000-000000000004";

describe("movieSchema", () => {
  it("accepts a minimal valid movie", () => {
    const result = movieSchema.safeParse({ title: "Inception", durationMinutes: "148" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.durationMinutes).toBe(148);
      expect(result.data.description).toBeUndefined();
    }
  });

  it("rejects an empty title", () => {
    const result = movieSchema.safeParse({ title: "", durationMinutes: 100 });
    expect(result.success).toBe(false);
  });

  it("rejects a non-positive duration", () => {
    const result = movieSchema.safeParse({ title: "X", durationMinutes: 0 });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid poster URL but allows an empty one", () => {
    const bad = movieSchema.safeParse({
      title: "X",
      durationMinutes: 100,
      posterUrl: "not-a-url",
    });
    expect(bad.success).toBe(false);

    const empty = movieSchema.safeParse({ title: "X", durationMinutes: 100, posterUrl: "" });
    expect(empty.success).toBe(true);
    if (empty.success) expect(empty.data.posterUrl).toBeUndefined();
  });
});

describe("updateMovieSchema", () => {
  it("requires a valid movieId alongside the movie fields", () => {
    const result = updateMovieSchema.safeParse({
      movieId: MOVIE_ID,
      title: "Updated Title",
      durationMinutes: 120,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a non-uuid movieId", () => {
    const result = updateMovieSchema.safeParse({
      movieId: "not-a-uuid",
      title: "X",
      durationMinutes: 100,
    });
    expect(result.success).toBe(false);
  });
});

describe("cinemaMovieSchema", () => {
  it("accepts valid cinema and movie ids", () => {
    const result = cinemaMovieSchema.safeParse({ cinemaId: CINEMA_ID, movieId: MOVIE_ID });
    expect(result.success).toBe(true);
  });

  it("rejects a missing movieId", () => {
    const result = cinemaMovieSchema.safeParse({ cinemaId: CINEMA_ID });
    expect(result.success).toBe(false);
  });
});

describe("createScreenSchema", () => {
  it("accepts a valid screen and defaults seatType to standard", () => {
    const result = createScreenSchema.safeParse({
      cinemaId: CINEMA_ID,
      name: "Screen 1",
      rows: "10",
      seatsPerRow: "12",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.seatType).toBe("standard");
      expect(result.data.rows).toBe(10);
    }
  });

  it("rejects rows/seatsPerRow outside the generator's bounds", () => {
    const tooManyRows = createScreenSchema.safeParse({
      cinemaId: CINEMA_ID,
      name: "Screen 1",
      rows: 100,
      seatsPerRow: 10,
    });
    expect(tooManyRows.success).toBe(false);

    const zeroSeats = createScreenSchema.safeParse({
      cinemaId: CINEMA_ID,
      name: "Screen 1",
      rows: 10,
      seatsPerRow: 0,
    });
    expect(zeroSeats.success).toBe(false);
  });

  it("rejects an unrecognized seatType", () => {
    const result = createScreenSchema.safeParse({
      cinemaId: CINEMA_ID,
      name: "Screen 1",
      rows: 10,
      seatsPerRow: 10,
      seatType: "vip-gold",
    });
    expect(result.success).toBe(false);
  });
});

describe("createShowtimeSchema", () => {
  const futureIso = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  it("accepts a valid future showtime and coerces basePrice to a number", () => {
    const result = createShowtimeSchema.safeParse({
      cinemaId: CINEMA_ID,
      screenId: SCREEN_ID,
      movieId: MOVIE_ID,
      startsAt: futureIso,
      basePrice: "12.50",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.basePrice).toBe(12.5);
      expect(result.data.startsAt).toBeInstanceOf(Date);
    }
  });

  it("rejects a showtime in the past", () => {
    const pastIso = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const result = createShowtimeSchema.safeParse({
      cinemaId: CINEMA_ID,
      screenId: SCREEN_ID,
      movieId: MOVIE_ID,
      startsAt: pastIso,
      basePrice: 10,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a negative price", () => {
    const result = createShowtimeSchema.safeParse({
      cinemaId: CINEMA_ID,
      screenId: SCREEN_ID,
      movieId: MOVIE_ID,
      startsAt: futureIso,
      basePrice: -5,
    });
    expect(result.success).toBe(false);
  });

  it("does NOT accept a currencyCode field even if supplied — it's ignored, not merged in", () => {
    const result = createShowtimeSchema.safeParse({
      cinemaId: CINEMA_ID,
      screenId: SCREEN_ID,
      movieId: MOVIE_ID,
      startsAt: futureIso,
      basePrice: 10,
      currencyCode: "EUR",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as Record<string, unknown>).currencyCode).toBeUndefined();
    }
  });

  it("rejects a price with more than 2 decimal places", () => {
    const result = createShowtimeSchema.safeParse({
      cinemaId: CINEMA_ID,
      screenId: SCREEN_ID,
      movieId: MOVIE_ID,
      startsAt: futureIso,
      basePrice: 12.999,
    });
    expect(result.success).toBe(false);
  });
});

describe("updateShowtimePriceSchema", () => {
  it("accepts a valid price update payload", () => {
    const result = updateShowtimePriceSchema.safeParse({
      cinemaId: CINEMA_ID,
      showtimeId: SHOWTIME_ID,
      basePrice: 15,
    });
    expect(result.success).toBe(true);
  });
});
