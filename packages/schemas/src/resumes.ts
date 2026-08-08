/**
 * Résumé validation schemas.
 *
 * Validates untrusted input for creating and updating résumé records.
 */

import { z } from "zod";

export const resumeLabelSchema = z
  .string()
  .trim()
  .min(1, "Label is required")
  .max(100, "Label must be 100 characters or fewer");

export const resumeMediaAssetIdSchema = z
  .string()
  .trim()
  .min(1, "Media asset ID is required")
  .max(64, "Too long");

export const resumeCreateSchema = z
  .object({
    label: resumeLabelSchema,
    mediaAssetId: resumeMediaAssetIdSchema,
    isCurrent: z.boolean().default(false),
    isVisible: z.boolean().default(true),
  })
  .strict();

export type ResumeCreateInput = z.infer<typeof resumeCreateSchema>;

export const resumeUpdateSchema = z
  .object({
    label: resumeLabelSchema.optional(),
    mediaAssetId: resumeMediaAssetIdSchema.optional(),
    isCurrent: z.boolean().optional(),
    isVisible: z.boolean().optional(),
  })
  .strict();

export type ResumeUpdateInput = z.infer<typeof resumeUpdateSchema>;

export const resumeIdSchema = z
  .string()
  .trim()
  .min(1, "ID is required")
  .max(64, "Too long");
