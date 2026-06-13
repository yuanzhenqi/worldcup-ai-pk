import { randomUUID } from "node:crypto";
import type { Database } from "better-sqlite3";
import type { AdminSummaryDto, AiModelConfigDto, AiProviderConfigDto, PromptTemplateConfigDto } from "@worldcup-ai-pk/shared";

export interface SaveAiProviderInput {
  name: string;
  displayName: string;
  baseUrl: string;
  apiKey: string;
  enabled: boolean;
}

export interface SaveAiModelInput {
  providerId: string;
  modelName: string;
  displayName: string;
  enabled: boolean;
}

export interface SavePromptTemplateInput {
  name: string;
  description: string;
  fullPrompt: string;
  promptSummary: string;
  scope: string;
  enabled: boolean;
  isDefault: boolean;
}

interface AiProviderRow {
  id: string;
  name: string;
  display_name: string;
  base_url: string;
  api_key: string;
  enabled: number;
}

interface AiModelRow {
  id: string;
  provider_id: string;
  model_name: string;
  display_name: string;
  enabled: number;
}

interface PromptTemplateRow {
  id: string;
  name: string;
  description: string;
  full_prompt: string;
  prompt_summary: string;
  scope: string;
  enabled: number;
  is_default: number;
}

interface SummaryCountRow {
  match_count: number;
  scheduled_count: number | null;
  live_count: number | null;
  finished_count: number | null;
}

interface SyncLogRow {
  level: string;
  source: string;
  message: string;
  created_at: string;
}

interface ContextCacheLogRow {
  match_id: string;
  domain: string;
  status: string;
  error: string | null;
  synced_at: string;
}

function toProviderDto(row: AiProviderRow): AiProviderConfigDto {
  return {
    id: row.id,
    name: row.name,
    displayName: row.display_name,
    baseUrl: row.base_url,
    enabled: row.enabled > 0,
    apiKeyConfigured: Boolean(row.api_key)
  };
}

function toModelDto(row: AiModelRow): AiModelConfigDto {
  return {
    id: row.id,
    providerId: row.provider_id,
    modelName: row.model_name,
    displayName: row.display_name,
    enabled: row.enabled > 0
  };
}

function toPromptTemplateDto(row: PromptTemplateRow): PromptTemplateConfigDto {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    fullPrompt: row.full_prompt,
    promptSummary: row.prompt_summary,
    scope: row.scope,
    enabled: row.enabled > 0,
    isDefault: row.is_default > 0
  };
}

function getProviderById(db: Database, id: string): AiProviderConfigDto {
  const row = db.prepare(
    `
      SELECT id, name, display_name, base_url, api_key, enabled
      FROM ai_providers
      WHERE id = ?
    `
  ).get(id) as AiProviderRow | undefined;

  if (!row) {
    throw new Error(`AI provider not found: ${id}`);
  }

  return toProviderDto(row);
}

function getModelById(db: Database, id: string): AiModelConfigDto {
  const row = db.prepare(
    `
      SELECT id, provider_id, model_name, display_name, enabled
      FROM ai_models
      WHERE id = ?
    `
  ).get(id) as AiModelRow | undefined;

  if (!row) {
    throw new Error(`AI model not found: ${id}`);
  }

  return toModelDto(row);
}

function getPromptTemplateById(db: Database, id: string): PromptTemplateConfigDto {
  const row = db.prepare(
    `
      SELECT id, name, description, full_prompt, prompt_summary, scope, enabled, is_default
      FROM prompt_templates
      WHERE id = ?
    `
  ).get(id) as PromptTemplateRow | undefined;

  if (!row) {
    throw new Error(`Prompt template not found: ${id}`);
  }

  return toPromptTemplateDto(row);
}

function clearOtherDefaultPromptTemplates(db: Database, id: string): void {
  db.prepare("UPDATE prompt_templates SET is_default = 0 WHERE id != ?").run(id);
}

export function getAdminSummary(db: Database): AdminSummaryDto {
  const counts = db.prepare(
    `
      SELECT
        COUNT(*) AS match_count,
        SUM(CASE WHEN status = 'scheduled' THEN 1 ELSE 0 END) AS scheduled_count,
        SUM(CASE WHEN status = 'live' THEN 1 ELSE 0 END) AS live_count,
        SUM(CASE WHEN status = 'finished' THEN 1 ELSE 0 END) AS finished_count
      FROM matches
    `
  ).get() as SummaryCountRow;
  const latestSyncLog = db.prepare(
    `
      SELECT level, source, message, created_at
      FROM system_logs
      WHERE source = 'api-football'
      ORDER BY created_at DESC
      LIMIT 1
    `
  ).get() as SyncLogRow | undefined;

  return {
    matchCount: counts.match_count,
    scheduledCount: counts.scheduled_count ?? 0,
    liveCount: counts.live_count ?? 0,
    finishedCount: counts.finished_count ?? 0,
    latestSyncLog: latestSyncLog
      ? {
          level: latestSyncLog.level,
          source: latestSyncLog.source,
          message: latestSyncLog.message,
          createdAt: latestSyncLog.created_at
        }
      : null
  };
}

export function listContextCacheLogs(db: Database) {
  const rows = db
    .prepare(
      `
        SELECT match_id, domain, status, error, synced_at
        FROM fixture_data_sync_logs
        ORDER BY synced_at DESC
        LIMIT 100
      `
    )
    .all() as ContextCacheLogRow[];

  return rows.map((row) => ({
    matchId: row.match_id,
    domain: row.domain,
    status: row.status,
    error: row.error,
    syncedAt: row.synced_at
  }));
}

export function listAiProviders(db: Database): AiProviderConfigDto[] {
  const rows = db.prepare(
    `
      SELECT id, name, display_name, base_url, api_key, enabled
      FROM ai_providers
      ORDER BY display_name ASC, name ASC
    `
  ).all() as AiProviderRow[];

  return rows.map(toProviderDto);
}

export function createAiProvider(db: Database, input: SaveAiProviderInput, now = new Date()): AiProviderConfigDto {
  const id = randomUUID();
  db.prepare(
    `
      INSERT INTO ai_providers (id, name, display_name, base_url, api_key, enabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
  ).run(id, input.name, input.displayName, input.baseUrl, input.apiKey, input.enabled ? 1 : 0, now.toISOString(), now.toISOString());

  return getProviderById(db, id);
}

export function updateAiProvider(db: Database, id: string, input: SaveAiProviderInput, now = new Date()): AiProviderConfigDto {
  db.prepare(
    `
      UPDATE ai_providers
      SET name = ?, display_name = ?, base_url = ?, api_key = ?, enabled = ?, updated_at = ?
      WHERE id = ?
    `
  ).run(input.name, input.displayName, input.baseUrl, input.apiKey, input.enabled ? 1 : 0, now.toISOString(), id);

  return getProviderById(db, id);
}

export function deleteAiProvider(db: Database, id: string): void {
  db.prepare("DELETE FROM ai_providers WHERE id = ?").run(id);
}

export function listAiModels(db: Database): AiModelConfigDto[] {
  const rows = db.prepare(
    `
      SELECT id, provider_id, model_name, display_name, enabled
      FROM ai_models
      ORDER BY display_name ASC, model_name ASC
    `
  ).all() as AiModelRow[];

  return rows.map(toModelDto);
}

export function createAiModel(db: Database, input: SaveAiModelInput, now = new Date()): AiModelConfigDto {
  const id = randomUUID();
  db.prepare(
    `
      INSERT INTO ai_models (id, provider_id, model_name, display_name, enabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `
  ).run(id, input.providerId, input.modelName, input.displayName, input.enabled ? 1 : 0, now.toISOString(), now.toISOString());

  return getModelById(db, id);
}

export function updateAiModel(db: Database, id: string, input: SaveAiModelInput, now = new Date()): AiModelConfigDto {
  db.prepare(
    `
      UPDATE ai_models
      SET provider_id = ?, model_name = ?, display_name = ?, enabled = ?, updated_at = ?
      WHERE id = ?
    `
  ).run(input.providerId, input.modelName, input.displayName, input.enabled ? 1 : 0, now.toISOString(), id);

  return getModelById(db, id);
}

export function deleteAiModel(db: Database, id: string): void {
  db.prepare("DELETE FROM ai_models WHERE id = ?").run(id);
}

export function listPromptTemplates(db: Database): PromptTemplateConfigDto[] {
  const rows = db.prepare(
    `
      SELECT id, name, description, full_prompt, prompt_summary, scope, enabled, is_default
      FROM prompt_templates
      ORDER BY name ASC
    `
  ).all() as PromptTemplateRow[];

  return rows.map(toPromptTemplateDto);
}

export function createPromptTemplate(db: Database, input: SavePromptTemplateInput, now = new Date()): PromptTemplateConfigDto {
  const id = randomUUID();
  const transaction = db.transaction(() => {
    db.prepare(
      `
        INSERT INTO prompt_templates (
          id,
          name,
          description,
          full_prompt,
          prompt_summary,
          scope,
          enabled,
          is_default,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
    ).run(
      id,
      input.name,
      input.description,
      input.fullPrompt,
      input.promptSummary,
      input.scope,
      input.enabled ? 1 : 0,
      input.isDefault ? 1 : 0,
      now.toISOString(),
      now.toISOString()
    );

    if (input.isDefault) {
      clearOtherDefaultPromptTemplates(db, id);
    }
  });

  transaction();
  return getPromptTemplateById(db, id);
}

export function updatePromptTemplate(db: Database, id: string, input: SavePromptTemplateInput, now = new Date()): PromptTemplateConfigDto {
  const transaction = db.transaction(() => {
    db.prepare(
      `
        UPDATE prompt_templates
        SET name = ?,
            description = ?,
            full_prompt = ?,
            prompt_summary = ?,
            scope = ?,
            enabled = ?,
            is_default = ?,
            updated_at = ?
        WHERE id = ?
      `
    ).run(
      input.name,
      input.description,
      input.fullPrompt,
      input.promptSummary,
      input.scope,
      input.enabled ? 1 : 0,
      input.isDefault ? 1 : 0,
      now.toISOString(),
      id
    );

    if (input.isDefault) {
      clearOtherDefaultPromptTemplates(db, id);
    }
  });

  transaction();
  return getPromptTemplateById(db, id);
}

export function deletePromptTemplate(db: Database, id: string): void {
  db.prepare("DELETE FROM prompt_templates WHERE id = ?").run(id);
}
