import { describe, it, expect } from 'vitest';
import {
  deserializeMentions,
  findMentionSpans,
  mentionToken,
  safeMentionName,
  serializeMentions,
} from './mentions';

const ANA = { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', full_name: 'Ana' };
const ANA_MARIA = { id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', full_name: 'Ana María' };
const RUTH = { id: 'cccccccc-cccc-cccc-cccc-cccccccccccc', full_name: 'Ruth [QA]' };
const MEMBERS = [ANA, ANA_MARIA, RUTH];

describe('safeMentionName / mentionToken', () => {
  it('strips square brackets that would break the token grammar', () => {
    expect(safeMentionName(' Ruth [QA] ')).toBe('Ruth QA');
    expect(mentionToken(RUTH)).toBe(`@[Ruth QA](${RUTH.id})`);
  });
});

describe('serializeMentions', () => {
  it('replaces a known @Nombre with its token', () => {
    expect(serializeMentions('Hola @Ana, revisa esto', MEMBERS)).toBe(`Hola ${mentionToken(ANA)}, revisa esto`);
  });

  it('prefers the longest matching name (no prefix collisions)', () => {
    expect(serializeMentions('@Ana María y @Ana', MEMBERS)).toBe(`${mentionToken(ANA_MARIA)} y ${mentionToken(ANA)}`);
  });

  it('falls back to a shorter name when the longer one is not a full match', () => {
    expect(serializeMentions('@Ana Maríax', MEMBERS)).toBe(`${mentionToken(ANA)} Maríax`);
  });

  it('leaves unknown names and emails untouched', () => {
    expect(serializeMentions('@Pedro y mail@Ana.com', MEMBERS)).toBe('@Pedro y mail@Ana.com');
  });

  it('does not match a name that is only a prefix of a longer word', () => {
    expect(serializeMentions('@Anabel', [ANA])).toBe('@Anabel');
    expect(serializeMentions('@Ana2', [ANA])).toBe('@Ana2');
  });

  it('handles names with stripped brackets and punctuation right after', () => {
    expect(serializeMentions('@Ruth QA: listo', MEMBERS)).toBe(`${mentionToken(RUTH)}: listo`);
  });

  it('handles multi-line text and repeated mentions', () => {
    const out = serializeMentions('@Ana\n@Ana', [ANA]);
    expect(out).toBe(`${mentionToken(ANA)}\n${mentionToken(ANA)}`);
  });

  it('returns the input unchanged with no members or no @', () => {
    expect(serializeMentions('@Ana', [])).toBe('@Ana');
    expect(serializeMentions('sin menciones', MEMBERS)).toBe('sin menciones');
  });

  it('uses the first member when two share a display name', () => {
    const dupe = { id: 'dddddddd-dddd-dddd-dddd-dddddddddddd', full_name: 'Ana' };
    expect(serializeMentions('@Ana', [ANA, dupe])).toBe(mentionToken(ANA));
  });
});

describe('findMentionSpans', () => {
  it('reports exact offsets of each mention', () => {
    const spans = findMentionSpans('Hola @Ana y @Ruth QA', MEMBERS);
    expect(spans).toEqual([
      { start: 5, end: 9, member: { id: ANA.id, full_name: 'Ana' } },
      { start: 12, end: 20, member: { id: RUTH.id, full_name: 'Ruth QA' } },
    ]);
  });
});

describe('deserializeMentions', () => {
  it('turns tokens back into @Nombre and lists the members', () => {
    const { display, mentions } = deserializeMentions(`Hola ${mentionToken(ANA)} y ${mentionToken(ANA_MARIA)}`);
    expect(display).toBe('Hola @Ana y @Ana María');
    expect(mentions).toEqual([ANA, ANA_MARIA]);
  });

  it('de-duplicates repeated ids and ignores malformed tokens', () => {
    const { display, mentions } = deserializeMentions(`${mentionToken(ANA)} ${mentionToken(ANA)} @[X](not-a-uuid)`);
    expect(display).toBe('@Ana @Ana @[X](not-a-uuid)');
    expect(mentions).toEqual([ANA]);
  });

  it('round-trips with serializeMentions', () => {
    const stored = `Revisen ${mentionToken(ANA_MARIA)}, gracias`;
    const { display, mentions } = deserializeMentions(stored);
    expect(serializeMentions(display, mentions)).toBe(stored);
  });
});
