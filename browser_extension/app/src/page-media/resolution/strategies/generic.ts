import {classifyTrackRole, isDashSegmentUrl, isStreamUrl, stripRangeParams} from "../url-classify";
import {newestMatching, postBindAttributedUrls, selectMergePair} from "../strategy";
import type {ResolveContext} from "../strategy";
import type {Resolution} from "../../types";

// Fallback strategy — runs when no per-site strategy matches the hostname.
export function selectGeneric(ctx: ResolveContext): Resolution {
  const post = postBindAttributedUrls(ctx.clicked);

  const master = post.find((r) => r.isMaster);
  if (master) {
    return { kind: "selection", selection: { kind: "stream", url: master.url } };
  }

  const stream = newestMatching(post, isStreamUrl);
  if (stream) {
    return { kind: "selection", selection: { kind: "stream", url: stream } };
  }

  if (ctx.clicked.formKind === "muxed") {
    const muxed = newestMatching(post, (url) => !isDashSegmentUrl(url));
    if (muxed) {
      return { kind: "selection", selection: { kind: "single", url: stripRangeParams(muxed), formKind: "muxed" } };
    }
    return { kind: "pending", reason: chrome.i18n.getMessage("waitingForVideoResource") };
  }

  if (ctx.clicked.formKind === "dash") {
    const pair = selectMergePair(post, classifyTrackRole);
    if (pair) {
      return { kind: "selection", selection: { kind: "merge", video: stripRangeParams(pair.video), audio: stripRangeParams(pair.audio) } };
    }
    return { kind: "pending", reason: chrome.i18n.getMessage("waitingForSeparateTracks") };
  }

  if (post.length === 0) {
    return { kind: "pending", reason: chrome.i18n.getMessage("waitingForVideoResource") };
  }
  if (post.length === 1) {
    const only = post[0];
    if (isDashSegmentUrl(only.url)) {
      // The sibling track may still be in flight pre-MSE-ack.
      return { kind: "pending", reason: chrome.i18n.getMessage("waitingForSeparateTracks") };
    }
    return { kind: "selection", selection: { kind: "single", url: stripRangeParams(only.url), formKind: "unknown" } };
  }

  // Previously we refused when multiple candidate URLs were present and asked the user
  // to pick from the resource probe page. To support the in-overlay multi-item selector
  // we return a selection that contains multiple single selections. The download-button
  // overlay will render these as a clickable list and send the chosen item.
  const multipleSelections = post.map((entry) => ({ kind: "single" as const, url: stripRangeParams(entry.url), formKind: "unknown" }));
  return { kind: "selection", selection: multipleSelections as unknown as any };
}
