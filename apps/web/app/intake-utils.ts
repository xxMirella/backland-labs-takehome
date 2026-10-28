// Convention: the AI analysis adds the tag "data-engineering" when the project is data engineering.
export const DATA_ENGINEERING_TAG = "data-engineering";

export const slug = (tag: string) => tag.trim().toLowerCase().replace(/[\s_]+/g, "-");

export const humanize = (tag: string) => {
  const text = slug(tag).replace(/-/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
};

// Sent date is a moment in time (shown in the viewer's timezone); the delivery date is a plain calendar date.
export const formatSent = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
