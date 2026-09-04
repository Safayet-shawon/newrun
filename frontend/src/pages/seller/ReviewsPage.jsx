import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Loader, EmptyState, RatingStars } from "@/components/shared/Bits";
import { timeAgo } from "@/lib/format";
import { Star } from "lucide-react";

export default function ReviewsPage() {
  const [reviews, setReviews] = useState(null);
  useEffect(() => { api.get("/seller/reviews").then(({ data }) => setReviews(data)); }, []);
  if (!reviews) return <Loader />;

  const avg = reviews.length ? (reviews.reduce((n, r) => n + r.rating, 0) / reviews.length).toFixed(1) : "0.0";

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold text-nexora-ink">Reviews</h1>
      {reviews.length === 0 ? (
        <EmptyState icon={Star} title="No reviews yet" description="Customer reviews of your products will appear here." />
      ) : (
        <>
          <div className="flex items-center gap-4 rounded-2xl border border-nexora-border bg-white p-5">
            <div className="text-center"><p className="text-4xl font-extrabold text-nexora-ink">{avg}</p><RatingStars value={avg} /></div>
            <div className="text-sm text-nexora-muted">Based on {reviews.length} customer reviews across your products.</div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {reviews.map((r) => (
              <div key={r.id} className="rounded-2xl border border-nexora-border bg-white p-4">
                <div className="flex items-center justify-between"><span className="font-semibold text-nexora-ink">{r.user_name}</span><span className="text-xs text-nexora-muted">{timeAgo(r.created_at)}</span></div>
                <span className="mt-1 inline-flex">{Array.from({ length: 5 }).map((_, i) => <Star key={i} size={13} className={i < r.rating ? "fill-nexora-amber text-nexora-amber" : "text-nexora-border"} />)}</span>
                <p className="mt-2 text-sm text-nexora-muted">{r.comment}</p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
