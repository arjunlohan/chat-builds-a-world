export interface RenderProfile { width: number; height: number; shadows: boolean; bloom: boolean; probe: boolean }
export const PRODUCTION_PROFILE: Readonly<RenderProfile> = Object.freeze({ width: 1920, height: 1080, shadows: true, bloom: true, probe: false });
/** The gate changes resolution only; every production shader, mesh and lighting pass is retained. */
export const CANDIDATE_PROFILE: Readonly<RenderProfile> = Object.freeze({ ...PRODUCTION_PROFILE, width: 160, height: 90, probe: true });
