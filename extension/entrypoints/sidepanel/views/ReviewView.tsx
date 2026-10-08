// The Review step: shows exactly what the capture script read from the page, so the buyer can fix
// anything before it is checked. This step exists because a fraud-risk check on a wrongly read
// listing would be a wrongly informed check.
//
// Rules this view follows:
//   - every field says in WORDS where its value came from: captured, edited, or not found;
//   - missing seller details are "unknown, not suspicious" and never block the check;
//   - the submit button explains what is missing instead of failing silently, and text over the
//     API limits is an error (with a counter), never silently cut;
//   - errors are announced to screen readers (role="alert"), not only shown in red;
//   - the retention notice sits in the same group as the submit button.
import { CategoryField, RETENTION_NOTICE } from "@guardianlens/shared";
import {
  LIMITS,
  validateDraft,
  type Draft,
  type DraftErrors,
  type DraftField,
  type DraftFieldKey,
} from "@/lib/panel/draft";

// How each marketplace is named in the heading chip.
const PLATFORM_NAMES = { carousell: "Carousell", mudah: "Mudah.my" } as const;

// The status line shown under a field, by where its value came from.
const STATUS_TEXT: Record<DraftField["status"], string> = {
  captured: "Captured",
  edited: "Edited by you",
  not_found: "Not found. Enter it yourself.",
};
// The status line for an optional seller field that was not found: it says "unknown", not "missing".
const OPTIONAL_NOT_FOUND = "Not found. Treated as unknown, not as suspicious.";

// What a disabled submit button is waiting for, in the words shown above it.
const NEEDS: Record<DraftFieldKey | "photos", string> = {
  title: "the title",
  description: "the description",
  price: "a valid price",
  category: "a category",
  photos: "at least one photo",
  accountAgeDays: "a valid account age",
  rating: "a valid rating",
  reviewCount: "a valid review count",
  activeListingCount: "a valid listing count",
};

// The optional seller inputs, in display order.
const SELLER_INPUTS: ReadonlyArray<{
  key: DraftFieldKey;
  id: string;
  label: string;
  inputMode: "numeric" | "decimal";
}> = [
  {
    key: "accountAgeDays",
    id: "account-age",
    label: "Account age in days",
    inputMode: "numeric",
  },
  {
    key: "rating",
    id: "rating",
    label: "Rating out of 5",
    inputMode: "decimal",
  },
  {
    key: "reviewCount",
    id: "review-count",
    label: "Review count",
    inputMode: "numeric",
  },
  {
    key: "activeListingCount",
    id: "active-listings",
    label: "Active listing count",
    inputMode: "numeric",
  },
];

/** Props of one form field: its draft value and status, limits, and the change callback. */
interface TextFieldProps {
  id: string;
  label: string;
  field: DraftField;
  error?: string;
  multiline?: boolean;
  /** Maximum length: shows a counter that turns into an error when exceeded. */
  limit?: number;
  optional?: boolean;
  inputMode?: "numeric" | "decimal";
  placeholder?: string;
  onChange(value: string): void;
}

/** A labelled text input or textarea with its status line, optional counter, and error. */
function TextField({
  id,
  label,
  field,
  error,
  multiline,
  limit,
  optional,
  inputMode,
  placeholder,
  onChange,
}: TextFieldProps) {
  const statusId = `${id}-status`;
  const countId = `${id}-count`;
  const errorId = `${id}-error`;
  const describedBy = [statusId, limit !== undefined ? countId : null, error ? errorId : null]
    .filter(Boolean)
    .join(" ");
  const length = field.value.trim().length;
  const over = limit !== undefined && length > limit;
  const status =
    field.status === "not_found" && optional ? OPTIONAL_NOT_FOUND : STATUS_TEXT[field.status];
  const shared = {
    id,
    value: field.value,
    placeholder,
    "aria-invalid": error ? (true as const) : undefined,
    "aria-describedby": describedBy,
  };
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {multiline ? (
        <textarea {...shared} onChange={(event) => onChange(event.target.value)} />
      ) : (
        <input
          {...shared}
          inputMode={inputMode}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      <span id={statusId} className={`field-status status-${field.status}`}>
        {status}
      </span>
      {limit !== undefined && (
        <span id={countId} className={`char-count ${over ? "error-text" : ""}`.trim()}>
          {length}/{limit}
        </span>
      )}
      {/* role="alert" so screen readers announce the error, not only sighted users who see red text. */}
      {error && (
        <span id={errorId} className="error-text" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

/** Props of the Review view: the draft, its errors and notice, and the callbacks for each action. */
export interface ReviewViewProps {
  draft: Draft;
  /** Errors from the server or from a rejected submit, keyed by field. */
  fieldErrors: DraftErrors;
  /** A one-line message shown above the form (for example "Seller details added..."). */
  notice: string | null;
  /** True while a check is being started or is running; the button is disabled and relabelled. */
  submitting: boolean;
  onEdit(key: DraftFieldKey, value: string): void;
  onTogglePhoto(url: string): void;
  onSubmit(): void;
  /** Opens a path on the GuardianLens website in a new tab (the manual form is "/assess"). */
  onOpenSite(path: string): void;
}

/** The Review view. */
export function ReviewView({
  draft,
  fieldErrors,
  notice,
  submitting,
  onEdit,
  onTogglePhoto,
  onSubmit,
  onOpenSite,
}: ReviewViewProps) {
  // Live validation drives the button and the helper line. An error is shown next to a field when
  // the server returned one, or when the buyer has put something in the field that is not valid.
  // An EMPTY required field is explained next to the button instead of with a red error.
  const live = validateDraft(draft);
  const blockers = Object.keys(live) as Array<DraftFieldKey | "photos">;
  // The error to show beside one field: the server's, else the live one if the field is not empty.
  const errorFor = (key: DraftFieldKey): string | undefined =>
    fieldErrors[key] ?? (draft.fields[key].value.trim() !== "" ? live[key] : undefined);
  const selectedCount = draft.photos.filter((photo) => photo.selected).length;
  const photoError = fieldErrors.photos ?? live.photos;
  // True while no seller detail has a value (captured or typed): the prompt to add them shows.
  const sellerMissing = SELLER_INPUTS.every(({ key }) => draft.fields[key].value.trim() === "");

  return (
    <form
      className="panel-form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (!submitting && blockers.length === 0) onSubmit();
      }}
    >
      <div>
        <h1 className="panel-title">Review what we captured</h1>
        <p className="helper">
          <span className="platform-chip">{PLATFORM_NAMES[draft.platform]}</span> Captured from this
          page when you clicked.
        </p>
      </div>

      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}

      <section aria-labelledby="photos-heading">
        <h2 id="photos-heading" className="panel-subtitle">
          Photos
        </h2>
        <ul className="photo-strip" aria-label="Listing photos">
          {draft.photos.map((photo, index) => (
            <li
              key={photo.url}
              className={`photo-item ${photo.selected ? "photo-selected" : ""}`.trim()}
            >
              <img src={photo.url} alt={`Listing photo ${index + 1}`} />
              <button
                type="button"
                className="photo-toggle"
                onClick={() => onTogglePhoto(photo.url)}
              >
                {`Photo ${index + 1}: ${photo.selected ? "included" : "not included"}`}
              </button>
            </li>
          ))}
        </ul>
        <p className="helper">
          {selectedCount} of {LIMITS.photos} photos included.
        </p>
        {photoError && (
          <p className="error-text" role="alert">
            {photoError}
          </p>
        )}
      </section>

      <TextField
        id="title"
        label="Title"
        field={draft.fields.title}
        error={errorFor("title")}
        limit={LIMITS.title}
        onChange={(value) => onEdit("title", value)}
      />
      <TextField
        id="description"
        label="Description"
        field={draft.fields.description}
        error={errorFor("description")}
        multiline
        limit={LIMITS.description}
        onChange={(value) => onEdit("description", value)}
      />
      <TextField
        id="price"
        label="Price"
        field={draft.fields.price}
        error={errorFor("price")}
        inputMode="decimal"
        placeholder="RM 1,250"
        onChange={(value) => onEdit("price", value)}
      />

      <div>
        <CategoryField
          id="category"
          value={draft.fields.category.value}
          error={errorFor("category")}
          onChange={(value) => onEdit("category", value)}
        />
        <span className={`field-status status-${draft.fields.category.status}`}>
          {STATUS_TEXT[draft.fields.category.status]}
        </span>
      </div>

      {/* Open by default: the behavioural signal is built from these details, so they are
          recommended, not hidden. They still never block the check. */}
      <details className="optional" open>
        <summary>Seller information (recommended)</summary>
        {sellerMissing && (
          <p className="notice">
            Seller details are not captured yet. The behavioural signal uses them, and without them
            it is shown as unknown. Open the seller&apos;s page and click the GuardianLens icon
            there, or type what you can see below.
          </p>
        )}
        <p className="helper">Missing seller details are treated as unknown, not as suspicious.</p>
        {SELLER_INPUTS.map(({ key, id, label, inputMode }) => (
          <TextField
            key={key}
            id={id}
            label={label}
            field={draft.fields[key]}
            error={errorFor(key)}
            optional
            inputMode={inputMode}
            onChange={(value) => onEdit(key, value)}
          />
        ))}
      </details>

      <div className="submit-bar">
        <p className="retention">{RETENTION_NOTICE}</p>
        {blockers.length > 0 && (
          <p className="helper">
            To continue, add or fix {blockers.map((key) => NEEDS[key]).join(", ")}.
          </p>
        )}
        <button
          type="submit"
          className="button button-primary button-full"
          disabled={submitting || blockers.length > 0}
        >
          {submitting ? "Checking…" : "Check listing"}
        </button>
        {/* Always available: when the page gives the panel nothing usable (for example no photo it
            may download), the website form is the way forward, never a dead end. */}
        <button type="button" className="button button-text" onClick={() => onOpenSite("/assess")}>
          Use the website form
        </button>
      </div>
    </form>
  );
}
