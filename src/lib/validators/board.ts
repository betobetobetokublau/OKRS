import { z } from 'zod';

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export const boardSchema = z.object({
  name: z.string().trim().min(1, 'El nombre es obligatorio').max(80, 'Máximo 80 caracteres'),
  description: z.string().max(500, 'Máximo 500 caracteres').nullable().optional(),
  color: z.string().regex(HEX_COLOR, 'Color inválido').default('#5c6ac4'),
  visibility: z.enum(['workspace', 'private']).default('workspace'),
  department_id: z.string().uuid().nullable().optional(),
  workspace_id: z.string().uuid(),
});

export const boardSectionSchema = z.object({
  name: z.string().trim().min(1, 'El nombre es obligatorio').max(60, 'Máximo 60 caracteres'),
  wip_limit: z.number().int().positive().nullable().optional(),
});

/**
 * Extracts the profile ids referenced by mention tokens in a comment.
 * Mentions are serialised as `@[Nombre](uuid)` so the plain text stays
 * readable and the id survives edits to the display name.
 */
export const MENTION_TOKEN = /@\[([^\]]+)\]\(([0-9a-fA-F-]{36})\)/g;

export function extractMentionIds(content: string): string[] {
  const ids = new Set<string>();
  for (const m of Array.from(content.matchAll(MENTION_TOKEN))) {
    const id = m[2];
    if (id) ids.add(id);
  }
  return Array.from(ids);
}

export type BoardFormData = z.infer<typeof boardSchema>;
export type BoardSectionFormData = z.infer<typeof boardSectionSchema>;
