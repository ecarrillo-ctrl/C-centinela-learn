import { z } from 'zod';

export const createTemplateSchema = z.object({
  name: z.string().min(1, 'Nombre es requerido').max(500),
  subject: z.string().min(1, 'Asunto es requerido').max(500),
  html_body: z.string().min(1, 'html_body es requerido'),
  text_body: z.string().nullable().optional(),
  red_flags: z.array(z.object({
    indicator: z.string(),
    description: z.string(),
  })).optional().default([]),
  difficulty: z.enum(['easy', 'medium', 'hard']).optional().default('medium'),
  category: z.string().max(100).nullable().optional(),
});

export const createCampaignSchema = z.object({
  name: z.string().min(1, 'Nombre es requerido').max(500),
  template_id: z.string().min(1, 'template_id es requerido'),
  org_unit_scope: z.string().nullable().optional(),
  // Si se define, la campaña opera en modo "ingeniería social pasiva":
  // usa la URL look-alike de la página corporativa en el correo y, al dar
  // clic, muestra la pantalla de precaución en vez de la landing educativa.
  corporate_page_id: z.string().nullable().optional(),
  targets: z.object({
    user_ids: z.array(z.string()).optional().default([]),
    ou_ids: z.array(z.string()).optional().default([]),
    group_ids: z.array(z.string()).optional().default([]),
  }).nullable().optional(),
  smart_group_rule: z.object({
    org_unit_id: z.string().uuid().optional(),
    min_risk_score: z.number().min(0).max(100).optional(),
    max_risk_score: z.number().min(0).max(100).optional(),
    phish_prone: z.boolean().optional(),
    fell_in_last_campaign: z.boolean().optional(),
    last_campaign_id: z.string().uuid().optional(),
    exclude_recent_reporters: z.boolean().optional(),
  }).nullable().optional(),
});

export const smartGroupPreviewSchema = z.object({
  org_unit_id: z.string().uuid().optional(),
  min_risk_score: z.number().min(0).max(100).optional(),
  max_risk_score: z.number().min(0).max(100).optional(),
  phish_prone: z.boolean().optional(),
  fell_in_last_campaign: z.boolean().optional(),
  last_campaign_id: z.string().uuid().optional(),
  exclude_recent_reporters: z.boolean().optional(),
});

export const pabReportSchema = z.object({
  reported_subject: z.string().min(1, 'reported_subject es requerido').max(500),
  reported_from: z.string().max(255).nullable().optional(),
});

export const createCorporatePageSchema = z.object({
  name: z.string().min(1, 'Nombre es requerido').max(255),
  real_url: z.string().min(1, 'real_url es requerida').max(500),
  lookalike_url: z.string().min(1, 'lookalike_url es requerida').max(500),
});

export const updateCorporatePageSchema = createCorporatePageSchema.partial();
