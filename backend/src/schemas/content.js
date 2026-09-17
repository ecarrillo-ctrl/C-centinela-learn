import { z } from 'zod';

export const uploadContentSchema = z.object({
  title: z.string().max(500).optional(),
  description: z.string().max(2000).optional().default(''),
  level: z.enum(['basico', 'intermedio', 'avanzado']).optional().default('basico'),
});

export const scormProgressSchema = z.object({
  status: z.string().min(1).max(50),
  progress: z.union([z.string(), z.number()]).transform(v => parseInt(String(v), 10)).optional(),
  score: z.union([z.string(), z.number()]).transform(v => v ? parseFloat(String(v)) : null).nullable().optional(),
  timeSpent: z.union([z.string(), z.number()]).transform(v => parseInt(String(v), 10) || 0).optional().default(0),
});

export const contentQuerySchema = z.object({
  type: z.enum(['scorm', 'video_embed', 'video_upload', 'pdf', 'presentation']).optional(),
  level: z.enum(['basico', 'intermedio', 'avanzado']).optional(),
  limit: z.string().transform(v => Math.min(Math.max(parseInt(v, 10) || 50, 1), 200)).optional(),
  offset: z.string().transform(v => Math.max(parseInt(v, 10) || 0, 0)).optional(),
});
