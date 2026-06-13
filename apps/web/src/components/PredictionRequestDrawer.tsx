import { useEffect, useMemo, useState } from "react";
import type {
  MatchDto,
  PredictionDataOptionsDto,
  PredictionOutputStyle,
  PredictionRequestInputDto,
  PredictionTaskType,
  PromptTemplateConfigDto
} from "@worldcup-ai-pk/shared";
import { BottomDrawer } from "./BottomDrawer";

interface PredictionRequestDrawerProps {
  open: boolean;
  match: MatchDto | null;
  promptTemplates: PromptTemplateConfigDto[];
  submitting: boolean;
  onClose: () => void;
  onSubmit: (input: PredictionRequestInputDto) => void;
}

const defaultTaskTypes: PredictionTaskType[] = ["result_1x2", "scoreline", "odds_interpretation"];

const taskOptions: Array<{ value: PredictionTaskType; label: string }> = [
  { value: "result_1x2", label: "胜平负" },
  { value: "scoreline", label: "比分预测" },
  { value: "odds_interpretation", label: "赔率解读" },
  { value: "player_lineup_impact", label: "球员/阵容影响" },
  { value: "head_to_head", label: "历史交锋" },
  { value: "upset_risk", label: "爆冷风险" }
];

const defaultDataOptions: PredictionDataOptionsDto = {
  useOdds: true,
  useApiFootballPrediction: false,
  useHeadToHead: true,
  usePlayerLineupInjuries: true
};

export function PredictionRequestDrawer({
  open,
  match,
  promptTemplates,
  submitting,
  onClose,
  onSubmit
}: PredictionRequestDrawerProps) {
  const enabledPromptTemplates = useMemo(() => promptTemplates.filter((template) => template.enabled), [promptTemplates]);
  const defaultPromptTemplateId = enabledPromptTemplates.find((template) => template.isDefault)?.id ?? enabledPromptTemplates[0]?.id ?? null;
  const [taskTypes, setTaskTypes] = useState<PredictionTaskType[]>(defaultTaskTypes);
  const [dataOptions, setDataOptions] = useState<PredictionDataOptionsDto>(defaultDataOptions);
  const [promptTemplateId, setPromptTemplateId] = useState<string | null>(defaultPromptTemplateId);
  const [customPrompt, setCustomPrompt] = useState("");
  const [outputStyle, setOutputStyle] = useState<PredictionOutputStyle>("concise");
  const [refreshContext, setRefreshContext] = useState(true);

  useEffect(() => {
    if (open) {
      setTaskTypes(defaultTaskTypes);
      setDataOptions(defaultDataOptions);
      setPromptTemplateId(defaultPromptTemplateId);
      setCustomPrompt("");
      setOutputStyle("concise");
      setRefreshContext(true);
    }
  }, [defaultPromptTemplateId, open]);

  function toggleTaskType(value: PredictionTaskType) {
    setTaskTypes((currentTypes) => {
      if (currentTypes.includes(value)) {
        const nextTypes = currentTypes.filter((type) => type !== value);
        return nextTypes.length > 0 ? nextTypes : currentTypes;
      }
      return [...currentTypes, value];
    });
  }

  function setDataOption(key: keyof PredictionDataOptionsDto, value: boolean) {
    setDataOptions((currentOptions) => ({ ...currentOptions, [key]: value }));
  }

  function handleSubmit() {
    onSubmit({
      taskTypes,
      dataOptions,
      promptTemplateId,
      customPrompt,
      outputStyle,
      refreshContext
    });
  }

  return (
    <BottomDrawer open={open} title="预测配置" onClose={onClose}>
      {match ? (
        <div className="prediction-drawer-content">
          <div className="drawer-match-title">
            <span>{match.statusLabelZh}</span>
            <strong>
              {match.homeTeam.displayNameZh} vs {match.awayTeam.displayNameZh}
            </strong>
          </div>

          <section className="drawer-section">
            <h4>预测任务</h4>
            <div className="drawer-option-grid">
              {taskOptions.map((option) => (
                <label key={option.value}>
                  <input type="checkbox" checked={taskTypes.includes(option.value)} onChange={() => toggleTaskType(option.value)} />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          </section>

          <section className="drawer-section">
            <h4>数据来源</h4>
            <label className="drawer-switch">
              <input type="checkbox" checked={refreshContext} onChange={(event) => setRefreshContext(event.target.checked)} />
              <span>自动刷新预测数据</span>
            </label>
            <div className="drawer-option-grid">
              <label>
                <input type="checkbox" checked={dataOptions.useOdds} onChange={(event) => setDataOption("useOdds", event.target.checked)} />
                <span>使用赔率</span>
              </label>
              <label>
                <input type="checkbox" checked={dataOptions.useHeadToHead} onChange={(event) => setDataOption("useHeadToHead", event.target.checked)} />
                <span>使用历史交锋</span>
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={dataOptions.usePlayerLineupInjuries}
                  onChange={(event) => setDataOption("usePlayerLineupInjuries", event.target.checked)}
                />
                <span>使用球员/阵容/伤停</span>
              </label>
            </div>
          </section>

          <section className="drawer-section">
            <h4>提示词</h4>
            <label className="drawer-field">
              <span>模板</span>
              <select value={promptTemplateId ?? ""} onChange={(event) => setPromptTemplateId(event.target.value || null)}>
                {enabledPromptTemplates.length === 0 ? <option value="">暂无模板</option> : null}
                {enabledPromptTemplates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="drawer-field">
              <span>自定义提示词</span>
              <textarea value={customPrompt} rows={4} onChange={(event) => setCustomPrompt(event.target.value)} />
            </label>
          </section>

          <section className="drawer-section">
            <h4>输出格式</h4>
            <div className="drawer-segmented" role="group" aria-label="输出格式">
              <button className={outputStyle === "concise" ? "active" : ""} type="button" onClick={() => setOutputStyle("concise")}>
                简洁结论
              </button>
              <button className={outputStyle === "detailed" ? "active" : ""} type="button" onClick={() => setOutputStyle("detailed")}>
                详细报告
              </button>
            </div>
          </section>

          <div className="drawer-actions">
            <button type="button" onClick={handleSubmit} disabled={submitting || !match.canRequestPrediction}>
              {submitting ? "提交中" : "开始预测"}
            </button>
          </div>
        </div>
      ) : null}
    </BottomDrawer>
  );
}
