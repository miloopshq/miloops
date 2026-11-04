import { str, type Front } from '../../model/frontmatter';
import { isRiskCategory, isRiskLevel, type DecisionRisk } from '../../model/risk';

/** A decision's risk as frontmatter keys: `risk`, `risk_category`, `risk_reason`. Absent risk writes nothing. */
export function riskFront(r: DecisionRisk | undefined): Front {
  if (!r) return {};
  return { risk: r.level, ...(r.category ? { risk_category: r.category } : {}), risk_reason: r.reason };
}

/** Reads the keys back; an unknown level means no risk, an unknown category is dropped. */
export function riskOf(front: Front): { risk?: DecisionRisk } {
  const level = str(front.risk);
  if (!isRiskLevel(level)) return {};
  const category = str(front.risk_category);
  const risk: DecisionRisk = {
    level,
    ...(isRiskCategory(category) ? { category } : {}),
    reason: str(front.risk_reason),
  };
  return { risk };
}
