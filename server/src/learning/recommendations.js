import { readinessMetricKeys } from '../common/readinessMetrics.js';

export function lessonRecommendationEvidence(activation) {
  if (!Array.isArray(activation?.metrics) || !activation.calculationVersion || !activation.computedAt) return { status: 'UNAVAILABLE', source: 'VendorActivation.readiness', needs: [] };
  const known = activation.metrics.filter(metric => readinessMetricKeys.includes(metric.key) && metric.complete === false && metric.value != null && !['UNKNOWN', 'UNAVAILABLE'].includes(metric.value));
  return { status: 'AVAILABLE', source: 'VendorActivation.readiness', calculationVersion: activation.calculationVersion, computedAt: activation.computedAt, needs: known.map(metric => ({ key: metric.key, label: metric.label })) };
}
export function lessonRecommendationReasons(lesson, progress, evidence) {
  if (evidence.status !== 'AVAILABLE' || progress?.completedAt) return [];
  const tags = Array.isArray(lesson.needsTags) ? lesson.needsTags : [];
  return evidence.needs.filter(metric => tags.includes(metric.key));
}
