"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { createBrowserSupabaseClient } from "@/lib/auth/client";
import { buildContainsPattern } from "@/lib/catalog/browse-query";
import styles from "./cinemas.module.css";

export interface CinemaSummary {
  id: string;
  name: string;
  description: string | null;
  location: string | null;
  country_code: string;
  currency_code: string;
  cover_image_url: string | null;
}

function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12" cy="10" r="2.4" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

export function CinemaCard({ cinema, featured = false }: { cinema: CinemaSummary; featured?: boolean }) {
  const image = cinema.cover_image_url || "/images/moviera/auth-cinema.png";
  return (
    <article className={`${styles.cinemaCard} ${featured ? styles.featuredCard : ""}`}>
      <div className={styles.cardImage} style={{ backgroundImage: `url("${image}")` }} role="img" aria-label={`${cinema.name} cinema`} />
      <div className={styles.cardBody}>
        <h3>{cinema.name}</h3>
        <p className={styles.location}><PinIcon />{cinema.location || cinema.country_code}</p>
        {cinema.description && <p className={styles.description}>{cinema.description}</p>}
        <div className={styles.tags} aria-label="Cinema information">
          <span>{cinema.country_code}</span><span>{cinema.currency_code}</span><span>Now booking</span>
        </div>
        <div className={styles.cardActions}>
          <Link className={`${styles.cardAction} ${styles.secondaryAction}`} href={`/cinemas/${cinema.id}`}>View cinema</Link>
          <Link className={styles.cardAction} href={`/showtimes?cinemaId=${cinema.id}`}>View showtimes</Link>
        </div>
      </div>
    </article>
  );
}

export function CinemaDirectory({
  initialCinemas,
  initialPage,
  pages,
  total,
  q,
  location,
  country,
}: {
  initialCinemas: CinemaSummary[];
  initialPage: number;
  pages: number;
  total: number;
  q?: string;
  location?: string;
  country?: string;
}) {
  const [cinemas, setCinemas] = useState(initialCinemas);
  const [page, setPage] = useState(initialPage);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function changePage(targetPage: number) {
    if (pending || targetPage < 1 || targetPage > pages || targetPage === page) return;
    startTransition(async () => {
      setError("");
      const from = (targetPage - 1) * 6;
      let query = createBrowserSupabaseClient()
        .from("cinemas")
        .select("id, name, description, location, country_code, currency_code, cover_image_url")
        .eq("status", "approved")
        .order("name", { ascending: true })
        .range(from, from + 5);
      if (q) query = query.or(`name.ilike.${buildContainsPattern(q)},location.ilike.${buildContainsPattern(q)}`);
      if (location) query = query.eq("location", location);
      if (country) query = query.eq("country_code", country);
      const { data, error: queryError } = await query;
      if (queryError) {
        setError("Could not load this cinema page. Please try again.");
        return;
      }
      setCinemas((data ?? []) as CinemaSummary[]);
      setPage(targetPage);
      const url = new URL(window.location.href);
      url.searchParams.set("page", String(targetPage));
      window.history.replaceState(null, "", url);
    });
  }

  const from = (page - 1) * 6;
  return (
    <>
      <div className={`${styles.grid} ${pending ? styles.loadingGrid : ""}`} aria-live="polite" aria-busy={pending}>
        {cinemas.map((cinema) => <CinemaCard key={cinema.id} cinema={cinema} />)}
      </div>
      {error && <p className={styles.directoryError} role="alert">{error}</p>}
      <div className={styles.paginationRow}>
        <p>Showing {from + 1}–{Math.min(from + cinemas.length, total)} of {total} cinemas</p>
        <nav className={styles.pagination} aria-label="Cinema pages">
          <button type="button" onClick={() => changePage(page - 1)} disabled={pending || page === 1} aria-label="Previous page">‹</button>
          <span className={styles.current}>{page}</span>
          <button type="button" onClick={() => changePage(page + 1)} disabled={pending || page === pages} aria-label="Next page">›</button>
        </nav>
      </div>
    </>
  );
}
