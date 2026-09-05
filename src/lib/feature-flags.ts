/**
 * Runtime-independent feature flags — plain constants, not env vars, because
 * these are product decisions the build should bake in, not per-deploy config.
 */

/**
 * Whether to surface estimated financial / energy-loss figures anywhere in the
 * UI (dashboard banner + Executive Overview KPI, anomaly-detail power-loss
 * card). Turned OFF at the client's request: they do not want losses quantified
 * or displayed at this stage. Flip to `true` to bring every loss surface back —
 * the JSX and the underlying numbers (plant.dailyLossINR, anomaly.dailyLossKWh,
 * …) are all still computed, just not rendered while this is false.
 */
export const SHOW_LOSS_METRICS = false;
