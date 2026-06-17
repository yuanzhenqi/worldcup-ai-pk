import { randomUUID } from "node:crypto";
import type { Database } from "better-sqlite3";
import type { BettingArenaDto } from "@worldcup-ai-pk/shared";
import { runOpenAiCompatiblePrediction } from "../ai/openAiCompatibleClient";
import { buildAccountContext, buildBattleContext } from "./bettingArena.context";
import { buildBettingArenaPrompt } from "./bettingArenaPrompts";
import { createBettingArenaRound, ensureBettingArenaAccounts, getBettingArenaSummary } from "./bettingArena.repository";
import { parseBettingArenaSlip } from "./bettingArenaSlip";

interface EnabledModelRow {
  model_id: string;
  model_name: string;
  model_display_name: string;
  base_url: string;
  api_key: string;
}

function listEnabledModels(db: Database): EnabledModelRow[] {
  return db
    .prepare(
      `
        SELECT
          ai_models.id AS model_id,
          ai_models.model_name,
          ai_models.display_name AS model_display_name,
          ai_providers.base_url,
          ai_providers.api_key
        FROM ai_models
        INNER JOIN ai_providers ON ai_providers.id = ai_models.provider_id
        WHERE ai_models.enabled = 1
          AND ai_providers.enabled = 1
        ORDER BY ai_models.display_name ASC
      `
    )
    .all() as EnabledModelRow[];
}

function countRoundSlips(db: Database, roundId: string): number {
  const row = db.prepare("SELECT COUNT(*) AS count FROM betting_arena_slips WHERE round_id = ?").get(roundId) as { count: number };
  return Number(row.count ?? 0);
}

export function getBettingArena(db: Database): BettingArenaDto {
  return getBettingArenaSummary(db);
}

export async function triggerBettingArenaRound(db: Database, now = new Date()): Promise<BettingArenaDto> {
  ensureBettingArenaAccounts(db, now);
  const roundDate = now.toISOString().slice(0, 10);
  const lockTime = now.toISOString();
  const externalIntel = { summary: "统一外部情报未配置", dataGaps: ["未配置外部联网情报采集"] };
  const battleContext = buildBattleContext(db, { roundDate, lockTime, externalIntel });
  const round = createBettingArenaRound(db, { roundDate, lockTime, battleContext, externalIntel, now });
  const timestamp = now.toISOString();

  if (countRoundSlips(db, round.id) > 0) {
    return getBettingArenaSummary(db);
  }

  db.prepare("UPDATE betting_arena_rounds SET status = ?, updated_at = ? WHERE id = ?").run("generating", timestamp, round.id);

  for (const model of listEnabledModels(db)) {
    const accountContext = buildAccountContext(db, model.model_id);
    try {
      const result = await runOpenAiCompatiblePrediction(
        { baseUrl: model.base_url, apiKey: model.api_key, modelName: model.model_name },
        buildBettingArenaPrompt({ battleContext, accountContext })
      );
      const parsed = parseBettingArenaSlip(result.content, battleContext, accountContext);
      db.prepare(
        `
          INSERT INTO betting_arena_slips (
            id,
            round_id,
            model_id,
            action,
            status,
            total_stake,
            potential_return,
            risk_level,
            raw_response,
            output_json,
            parsed_slip_json,
            account_context_json,
            validation_error,
            created_at,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
      ).run(
        randomUUID(),
        round.id,
        model.model_id,
        parsed.action,
        "accepted",
        parsed.totalStake,
        parsed.potentialReturn,
        parsed.riskLevel,
        result.rawResponse,
        result.content,
        JSON.stringify(parsed),
        JSON.stringify(accountContext),
        null,
        timestamp,
        timestamp
      );

      if (parsed.totalStake > 0) {
        db.prepare(
          `
            UPDATE betting_arena_accounts
            SET available_bankroll = available_bankroll - ?,
                frozen_stake = frozen_stake + ?,
                total_staked = total_staked + ?,
                order_count = order_count + 1,
                updated_at = ?
            WHERE model_id = ?
          `
        ).run(parsed.totalStake, parsed.totalStake, parsed.totalStake, timestamp, model.model_id);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Betting arena generation failed";
      db.prepare(
        `
          INSERT INTO betting_arena_slips (
            id,
            round_id,
            model_id,
            action,
            status,
            total_stake,
            potential_return,
            risk_level,
            raw_response,
            output_json,
            parsed_slip_json,
            account_context_json,
            validation_error,
            created_at,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
      ).run(randomUUID(), round.id, model.model_id, "hold", "generation_failed", 0, 0, "low", "", "{}", "{}", JSON.stringify(accountContext), message, timestamp, timestamp);
      db.prepare("UPDATE betting_arena_accounts SET failed_generation_count = failed_generation_count + 1, updated_at = ? WHERE model_id = ?").run(timestamp, model.model_id);
    }
  }

  db.prepare("UPDATE betting_arena_rounds SET status = ?, updated_at = ? WHERE id = ?").run("locked", timestamp, round.id);
  return getBettingArenaSummary(db);
}

export function getBettingArenaRound(db: Database, roundId: string): BettingArenaDto {
  const summary = getBettingArenaSummary(db);
  if (!summary.currentRound || summary.currentRound.id !== roundId) return summary;
  return summary;
}

export function settleBettingArenaRound(db: Database, roundId: string): BettingArenaDto {
  db.prepare("UPDATE betting_arena_rounds SET status = ?, updated_at = ? WHERE id = ?").run("settled", new Date().toISOString(), roundId);
  return getBettingArenaSummary(db);
}
