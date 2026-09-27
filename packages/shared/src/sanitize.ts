/**
 * Sanitize user-supplied display text for safe broadcast.
 *
 * Strips:
 * - C0/C1 control characters (U+0000–U+001F, U+007F–U+009F)
 * - ANSI escape sequences (\x1b[...m, \x1b]...BEL/ST, etc.)
 * - OSC sequences (\x9d ... \x9c or \x1b] ... \x07/ST)
 * - Unicode bidi override/isolate characters (U+202A–U+202E, U+2066–U+2069)
 * - Zero-width characters (U+200B, U+FEFF, U+00AD, etc.)
 * - Collapses internal whitespace to a single space and trims
 *
 * @throws {Error} if the sanitized value is empty
 */
export function sanitizeDisplayText(raw: string): string {
  let s = raw;

  // Strip OSC sequences: \x1b] ... (\x07 | \x1b\\ | \x9c)
  s = s.replace(/\x1b\][^\x07\x1b\x9c]*(?:\x07|\x1b\\|\x9c)/g, "");
  // Strip DCS/APC/PM/OSC (C1 introducer variant)
  s = s.replace(/\x9d[^\x9c]*\x9c/g, "");
  // Strip CSI sequences: \x1b[ ... final byte
  s = s.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, "");
  // Strip remaining ESC sequences (2-char or with intermediate)
  s = s.replace(/\x1b[@-_][0-9;?]*/g, "");
  // Strip any remaining lone ESC
  s = s.replace(/\x1b/g, "");

  // Strip C0 control chars (except we keep \t which becomes a space)
  s = s.replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "");
  // Strip C1 control chars U+0080–U+009F
  s = s.replace(/[\u0080-\u009f]/g, "");

  // Strip bidi override/isolate characters
  // LRO, RLO, LRE, RLE, PDF, LRM, RLM, LRI, RLI, FSI, PDI
  s = s.replace(/[‎‏‪-‮⁦-⁩]/g, "");

  // Strip zero-width characters
  // ZWSP, ZWJ, ZWNJ, SOFT HYPHEN, BOM/ZWNBSP, WORD JOINER
  s = s.replace(/[­​‌‍⁠﻿]/g, "");

  // Collapse all whitespace (including tabs from above) to single space and trim
  s = s.replace(/\s+/g, " ").trim();

  if (s.length === 0) {
    throw new Error("Display text is empty after sanitization");
  }

  return s;
}
