import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  Loader2,
  MessageSquare,
  Pencil,
  Send,
  Star,
  Trash2,
} from "lucide-react";

import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/lib/AuthContext";

const STAR_VALUES = [1, 2, 3, 4, 5];
const MAX_REVIEW_LENGTH = 1500;

const clean = (value) =>
  String(value ?? "").trim();

const asRows = (value) =>
  Array.isArray(value) ? value : [];

const safeRating = (value) => {
  const number = Number(value);

  return Number.isInteger(number) &&
    number >= 1 &&
    number <= 5
    ? number
    : 0;
};

const reviewTime = (row) => {
  const raw =
    row?.updated_date ||
    row?.created_date ||
    "";

  if (!raw) {
    return "";
  }

  const date = new Date(raw);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
    }).format(date);
  } catch {
    return date.toLocaleDateString();
  }
};

const displayNameFor = (user) =>
  clean(
    user?.full_name ||
      user?.display_name ||
      user?.name
  ).slice(0, 80) || "Media God user";

export default function MediaReviews({
  tmdbId,
  mediaType = "movie",
  title,
  season = null,
  episode = null,
  episodeTitle = "",
  compact = false,
}) {
  const {
    user,
    isAuthenticated,
    navigateToLogin,
  } = useAuth();

  const { toast } = useToast();

  const contentKey = useMemo(() => {
    const id = clean(tmdbId);

    if (!id) {
      return "";
    }

    if (mediaType === "episode") {
      const seasonNumber = Number(season);
      const episodeNumber = Number(episode);

      if (
        !Number.isInteger(seasonNumber) ||
        seasonNumber < 0 ||
        !Number.isInteger(episodeNumber) ||
        episodeNumber < 1
      ) {
        return "";
      }

      return `episode:${id}:s${seasonNumber}:e${episodeNumber}`;
    }

    return `movie:${id}`;
  }, [
    episode,
    mediaType,
    season,
    tmdbId,
  ]);

  const [reviews, setReviews] = useState([]);
  const [ownReview, setOwnReview] = useState(null);
  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState("");
  const [loading, setLoading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState("");

  const loadReviews = useCallback(async () => {
    if (!contentKey) {
      setReviews([]);
      setOwnReview(null);
      setRating(0);
      setReviewText("");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const rows =
        await base44.entities.MediaReview.filter({
          content_key: contentKey,
          published: true,
        });

      const ordered = asRows(rows)
        .filter((row) => safeRating(row?.rating) > 0)
        .slice()
        .sort(
          (left, right) =>
            new Date(
              right?.updated_date ||
                right?.created_date ||
                0
            ).getTime() -
            new Date(
              left?.updated_date ||
                left?.created_date ||
                0
            ).getTime()
        )
        .slice(0, 100);

      setReviews(ordered);

      if (isAuthenticated && user?.id) {
        const ownRows =
          await base44.entities.MediaReview.filter({
            content_key: contentKey,
            created_by_id: String(user.id),
          });

        const current = asRows(ownRows)
          .slice()
          .sort(
            (left, right) =>
              new Date(
                right?.updated_date ||
                  right?.created_date ||
                  0
              ).getTime() -
              new Date(
                left?.updated_date ||
                  left?.created_date ||
                  0
              ).getTime()
          )[0] || null;

        setOwnReview(current);
        setRating(safeRating(current?.rating));
        setReviewText(
          clean(current?.review_text).slice(
            0,
            MAX_REVIEW_LENGTH
          )
        );
      } else {
        setOwnReview(null);
        setRating(0);
        setReviewText("");
      }
    } catch (loadError) {
      setReviews([]);
      setOwnReview(null);
      setError(
        loadError?.message ||
          "Reviews could not be loaded."
      );
    } finally {
      setLoading(false);
    }
  }, [
    contentKey,
    isAuthenticated,
    user?.id,
  ]);

  useEffect(() => {
    loadReviews();
  }, [loadReviews]);

  useEffect(() => {
    if (!contentKey) {
      return undefined;
    }

    const unsubscribe =
      base44.entities.MediaReview.subscribe?.(
        (event) => {
          if (
            clean(event?.data?.content_key) ===
            contentKey
          ) {
            loadReviews();
          }
        }
      );

    return () => {
      unsubscribe?.();
    };
  }, [
    contentKey,
    loadReviews,
  ]);

  const averageRating = useMemo(() => {
    if (!reviews.length) {
      return 0;
    }

    return (
      reviews.reduce(
        (total, row) =>
          total +
          safeRating(row?.rating),
        0
      ) / reviews.length
    );
  }, [reviews]);

  const publishReview = async () => {
    if (!isAuthenticated || !user?.id) {
      navigateToLogin();
      return;
    }

    if (!rating) {
      toast({
        title: "Choose 1 to 5 stars",
        description:
          "Select a star rating before publishing your review.",
        variant: "destructive",
      });
      return;
    }

    if (!contentKey) {
      return;
    }

    setPublishing(true);
    setError("");

    const payload = {
      content_key: contentKey,
      tmdb_id: clean(tmdbId),
      media_type:
        mediaType === "episode"
          ? "episode"
          : "movie",
      season:
        mediaType === "episode"
          ? Number(season)
          : undefined,
      episode:
        mediaType === "episode"
          ? Number(episode)
          : undefined,
      title:
        clean(title) ||
        "Untitled",
      episode_title:
        mediaType === "episode"
          ? clean(episodeTitle)
          : "",
      rating,
      review_text:
        reviewText
          .trim()
          .slice(
            0,
            MAX_REVIEW_LENGTH
          ),
      reviewer_name:
        displayNameFor(user),
      published: true,
    };

    try {
      if (ownReview?.id) {
        await base44.entities.MediaReview.update(
          ownReview.id,
          payload
        );
      } else {
        await base44.entities.MediaReview.create(
          payload
        );
      }

      toast({
        title:
          ownReview?.id
            ? "Review updated"
            : "Review published",
        description:
          "Your rating is live now.",
      });

      await loadReviews();
    } catch (publishError) {
      setError(
        publishError?.message ||
          "Your review could not be published."
      );
    } finally {
      setPublishing(false);
    }
  };

  const deleteReview = async () => {
    if (!ownReview?.id || publishing) {
      return;
    }

    setPublishing(true);
    setError("");

    try {
      await base44.entities.MediaReview.delete(
        ownReview.id
      );

      setOwnReview(null);
      setRating(0);
      setReviewText("");

      toast({
        title: "Review removed",
      });

      await loadReviews();
    } catch (deleteError) {
      setError(
        deleteError?.message ||
          "Your review could not be removed."
      );
    } finally {
      setPublishing(false);
    }
  };

  if (!contentKey) {
    return null;
  }

  return (
    <section
      data-mg-media-reviews="true"
      className={
        compact
          ? "mt-3 rounded-lg border border-white/10 bg-black/20 p-3"
          : "mt-5 3xl:mt-8 rounded-xl border border-white/10 bg-mg-card/60 p-4 3xl:p-5"
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-sm 3xl:text-lg font-bold text-white">
            <MessageSquare className="h-4 w-4 text-mg-green" />
            Ratings & reviews
          </h3>

          <p className="mt-1 text-xs 3xl:text-sm text-white/45">
            {reviews.length > 0
              ? `${averageRating.toFixed(1)}/5 · ${reviews.length} ${reviews.length === 1 ? "review" : "reviews"}`
              : "No reviews yet"}
          </p>
        </div>

        {loading && (
          <Loader2 className="h-4 w-4 animate-spin text-white/45" />
        )}
      </div>

      <div className="mt-4 rounded-lg border border-white/10 bg-black/20 p-3">
        {isAuthenticated ? (
          <>
            <p className="text-xs font-semibold text-white/70">
              {ownReview?.id
                ? "Edit your review"
                : "Rate this"}
            </p>

            <div
              className="mt-2 flex flex-wrap gap-1"
              role="group"
              aria-label="Choose a rating from 1 to 5 stars"
            >
              {STAR_VALUES.map(
                (value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() =>
                      setRating(value)
                    }
                    className="flex h-10 w-10 items-center justify-center rounded-md text-white/30 hover:bg-white/5 hover:text-mg-green focus:outline-none focus:ring-2 focus:ring-mg-green"
                    aria-label={`${value} ${value === 1 ? "star" : "stars"}`}
                    aria-pressed={
                      rating === value
                    }
                  >
                    <Star
                      className={
                        value <= rating
                          ? "h-5 w-5 fill-mg-green text-mg-green"
                          : "h-5 w-5"
                      }
                    />
                  </button>
                )
              )}
            </div>

            <textarea
              value={reviewText}
              onChange={(event) =>
                setReviewText(
                  event.target.value.slice(
                    0,
                    MAX_REVIEW_LENGTH
                  )
                )
              }
              maxLength={
                MAX_REVIEW_LENGTH
              }
              rows={
                compact ? 3 : 4
              }
              placeholder="Write a review (optional)"
              className="mt-3 w-full resize-y rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white placeholder:text-white/25 outline-none focus:border-mg-green"
            />

            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-[10px] text-white/30">
                {reviewText.length}/
                {MAX_REVIEW_LENGTH}
              </span>

              <div className="flex gap-2">
                {ownReview?.id && (
                  <button
                    type="button"
                    onClick={
                      deleteReview
                    }
                    disabled={
                      publishing
                    }
                    className="min-h-10 inline-flex items-center gap-1.5 rounded-md border border-red-500/20 bg-red-500/5 px-3 text-xs font-semibold text-red-300 hover:bg-red-500/10 disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </button>
                )}

                <button
                  type="button"
                  onClick={
                    publishReview
                  }
                  disabled={
                    publishing ||
                    !rating
                  }
                  className="min-h-10 inline-flex items-center gap-1.5 rounded-md bg-mg-green px-3 text-xs font-bold text-black hover:bg-mg-green-dim disabled:opacity-50"
                >
                  {publishing ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : ownReview?.id ? (
                    <Pencil className="h-3.5 w-3.5" />
                  ) : (
                    <Send className="h-3.5 w-3.5" />
                  )}

                  {ownReview?.id
                    ? "Update review"
                    : "Publish review"}
                </button>
              </div>
            </div>

            <p className="mt-2 text-[10px] leading-4 text-white/30">
              Reviews publish immediately.
            </p>
          </>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs leading-5 text-white/50">
              Sign in to give this a 1–5 star rating and publish a written review.
            </p>

            <button
              type="button"
              onClick={
                navigateToLogin
              }
              className="min-h-10 rounded-md border border-mg-green/30 bg-mg-green/10 px-3 text-xs font-bold text-mg-green hover:bg-mg-green/15"
            >
              Sign in to review
            </button>
          </div>
        )}
      </div>

      {error && (
        <p
          role="alert"
          className="mt-3 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-300"
        >
          {error}
        </p>
      )}

      <div className="mt-4 space-y-3">
        {reviews.map((row) => {
          const stars =
            safeRating(
              row?.rating
            );

          return (
            <article
              key={
                row?.id ||
                `${row?.created_date}-${row?.reviewer_name}`
              }
              className="rounded-lg border border-white/5 bg-white/[0.025] p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-white/75">
                    {clean(
                      row?.reviewer_name
                    ) ||
                      "Media God user"}
                  </p>

                  {reviewTime(row) && (
                    <p className="mt-0.5 text-[10px] text-white/30">
                      {reviewTime(row)}
                    </p>
                  )}
                </div>

                <div
                  className="flex items-center gap-0.5"
                  aria-label={`${stars} out of 5 stars`}
                >
                  {STAR_VALUES.map(
                    (value) => (
                      <Star
                        key={
                          value
                        }
                        className={
                          value <=
                          stars
                            ? "h-3.5 w-3.5 fill-mg-green text-mg-green"
                            : "h-3.5 w-3.5 text-white/15"
                        }
                      />
                    )
                  )}
                </div>
              </div>

              {clean(
                row?.review_text
              ) && (
                <p className="mt-2 whitespace-pre-wrap break-words text-xs leading-5 text-white/60">
                  {clean(
                    row?.review_text
                  )}
                </p>
              )}
            </article>
          );
        })}

        {!loading &&
          reviews.length ===
            0 && (
            <p className="rounded-lg border border-dashed border-white/10 px-3 py-4 text-center text-xs text-white/35">
              Be the first to rate and review this.
            </p>
          )}
      </div>
    </section>
  );
}
