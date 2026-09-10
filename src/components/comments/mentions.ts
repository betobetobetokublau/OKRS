import { MENTION_TOKEN } from '@/lib/validators/board';
import type { Profile } from '@/types';

/** The minimum a mention needs: who (id) and how they are displayed (name). */
export type MentionMember = Pick<Profile, 'id' | 'full_name'>;

/** A `@Nombre` span found in display text, with the member it resolves to. */
export interface MentionSpan {
  /** Index of the "@" in the display text. */
  start: number;
  /** Index right after the last character of the name. */
  end: number;
  member: MentionMember;
}

/**
 * Characters that continue a word; a mention must not be followed by one.
 * ASCII letters/digits plus the Latin-1 / Latin Extended ranges (accents, ñ),
 * spelled out because `tsc` targets ES5 and rejects `\p{L}` with the `u` flag.
 */
const WORD_CHAR = /[A-Za-z0-9_\u00C0-\u024F\u1E00-\u1EFF]/;

/**
 * Names are stored inside `@[Nombre](uuid)`, so square brackets would break the
 * token grammar. This is the display form used everywhere (`@Nombre`).
 */
export function safeMentionName(fullName: string): string {
  return fullName.replace(/[[\]]/g, '').trim();
}

/** Serialise a member as the token stored in `comments.content`. */
export function mentionToken(member: MentionMember): string {
  return `@[${safeMentionName(member.full_name)}](${member.id})`;
}

/**
 * De-duplicate members by display name (first wins) and sort longest name
 * first, so `@Ana María` is matched before `@Ana`.
 */
function uniqueByNameLongestFirst(members: readonly MentionMember[]): MentionMember[] {
  const byName = new Map<string, MentionMember>();
  for (const m of members) {
    const name = safeMentionName(m.full_name);
    if (!name || byName.has(name)) continue;
    byName.set(name, { id: m.id, full_name: name });
  }
  return Array.from(byName.values()).sort((a, b) => b.full_name.length - a.full_name.length);
}

/**
 * Finds every `@Nombre` in `display` whose name belongs to a known member. A
 * mention must start at the beginning of the text or after a non-word
 * character, and must not be immediately followed by a word character (so
 * `@Ana` does not match inside `@Anabel` unless Anabel is also a member —
 * longest names are tried first at each "@").
 */
export function findMentionSpans(display: string, members: readonly MentionMember[]): MentionSpan[] {
  const ordered = uniqueByNameLongestFirst(members);
  const spans: MentionSpan[] = [];
  if (ordered.length === 0) return spans;
  let at = display.indexOf('@');
  while (at !== -1) {
    const before = at > 0 ? display.charAt(at - 1) : '';
    let end = at + 1;
    if (!before || !WORD_CHAR.test(before)) {
      for (const member of ordered) {
        const candidateEnd = at + 1 + member.full_name.length;
        if (!display.startsWith(member.full_name, at + 1)) continue;
        const after = display.charAt(candidateEnd);
        if (after && WORD_CHAR.test(after)) continue;
        spans.push({ start: at, end: candidateEnd, member });
        end = candidateEnd;
        break;
      }
    }
    at = display.indexOf('@', end);
  }
  return spans;
}

/**
 * Display text → stored content: every `@Nombre` of a known member becomes
 * `@[Nombre](uuid)`. Unknown names are left untouched.
 */
export function serializeMentions(display: string, members: readonly MentionMember[]): string {
  const spans = findMentionSpans(display, members);
  if (spans.length === 0) return display;
  let out = '';
  let last = 0;
  for (const span of spans) {
    out += display.slice(last, span.start) + mentionToken(span.member);
    last = span.end;
  }
  return out + display.slice(last);
}

/**
 * Stored content → display text: `@[Nombre](uuid)` becomes `@Nombre`. Also
 * returns the members referenced, so the editor can serialise them back even
 * when they are no longer workspace members.
 */
export function deserializeMentions(serialized: string): { display: string; mentions: MentionMember[] } {
  const seen = new Map<string, MentionMember>();
  const display = serialized.replace(new RegExp(MENTION_TOKEN.source, 'g'), (_full, name: string, id: string) => {
    const safe = safeMentionName(name);
    if (!seen.has(id)) seen.set(id, { id, full_name: safe });
    return `@${safe}`;
  });
  return { display, mentions: Array.from(seen.values()) };
}
