// Entry point for HR routes: only the HR repository is exported here.
export * from "./hr-repository";
export * from "./hr-rigour";
export * from "./hr-signals";
export * from "./hr-comments";
export * from "./hr-push";
export { overlayTranslations, type TranslatableEntity } from "./hr-i18n";
export {
  recordDecision, listDecisions, decisionSummary, alarmInfo, questionInfo,
  DECISION_ENTITIES, DECISION_ACTIONS, DECISION_FONTS,
  type DecisionInput, type DecisionRow, type DecisionSummary, type DecisionEntity, type DecisionAction, type DecisionFont,
} from "./hr-decisions";
