// The product mark: an eye in a navy tile, then the name with "Lens" in the accent colour.
// Both the website header and the side panel header render it, so the brand reads the same.
import { Icon } from "./Icon";

/** Renders the tile and the name. The caller supplies the wrapping link or element. */
export function Wordmark() {
  return (
    <>
      <span className="logo-mark" aria-hidden="true">
        <Icon name="eye" />
      </span>
      <span>
        Guardian<span className="wordmark-lens">Lens</span>
      </span>
    </>
  );
}
