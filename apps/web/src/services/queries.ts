import { useQuery } from '@tanstack/react-query';
import { api } from './api';

const STALE = 5 * 60_000;
export const useMissions = (q?: Parameters<typeof api.missions>[0]) => useQuery({ queryKey: ['missions', q], queryFn: () => api.missions(q), staleTime: STALE });
export const useMission = (id?: string) => useQuery({ queryKey: ['mission', id], queryFn: () => api.mission(id!), enabled: !!id, staleTime: STALE });
export const useLandingSites = () => useQuery({ queryKey: ['landing-sites'], queryFn: api.landingSites, staleTime: STALE });
export const useLandingSite = (id?: string) => useQuery({ queryKey: ['landing-site', id], queryFn: () => api.landingSite(id!), enabled: !!id, staleTime: STALE });
export const useSiteTerrain = (id?: string) => useQuery({ queryKey: ['site-terrain', id], queryFn: () => api.siteTerrain(id!), enabled: !!id, staleTime: STALE });
export const useRegions = () => useQuery({ queryKey: ['regions'], queryFn: api.regions, staleTime: STALE });
export const useRegion = (id?: string) => useQuery({ queryKey: ['region', id], queryFn: () => api.region(id!), enabled: !!id, staleTime: STALE });
export const useSpacecraft = () => useQuery({ queryKey: ['spacecraft'], queryFn: api.spacecraft, staleTime: STALE });
export const useSpacecraftById = (id?: string) => useQuery({ queryKey: ['spacecraft', id], queryFn: () => api.spacecraftById(id!), enabled: !!id, staleTime: STALE });
export const usePayloads = () => useQuery({ queryKey: ['payloads'], queryFn: api.payloads, staleTime: STALE });
export const usePayload = (id?: string) => useQuery({ queryKey: ['payload', id], queryFn: () => api.payload(id!), enabled: !!id, staleTime: STALE });
export const useProviders = () => useQuery({ queryKey: ['providers'], queryFn: api.providers, staleTime: STALE });
export const useProvider = (id?: string) => useQuery({ queryKey: ['provider', id], queryFn: () => api.provider(id!), enabled: !!id, staleTime: STALE });
export const useAssets = () => useQuery({ queryKey: ['assets'], queryFn: api.assets, staleTime: Infinity });
export const useSources = () => useQuery({ queryKey: ['sources'], queryFn: api.sources, staleTime: STALE });
export const useTimeline = () => useQuery({ queryKey: ['timeline'], queryFn: api.timeline, staleTime: STALE });
export const useTilesets = () => useQuery({ queryKey: ['tilesets'], queryFn: api.tilesets, staleTime: Infinity });
export const useHistoricMissions = () => useQuery({ queryKey: ['research', 'missions'], queryFn: api.researchMissions, staleTime: Infinity });
export const useResearchModel = () => useQuery({ queryKey: ['research', 'model'], queryFn: api.researchModel, staleTime: Infinity });
export const usePlanOptions = () => useQuery({ queryKey: ['research', 'options'], queryFn: api.researchOptions, staleTime: Infinity });
export const usePlan = (input: import('@/types/domain').PlanInput | null) =>
  useQuery({ queryKey: ['research', 'plan', input], queryFn: () => api.researchPlan(input!), enabled: !!input, staleTime: Infinity });
export const useLaunchSites = () => useQuery({ queryKey: ['launch-sites'], queryFn: api.launchSites, staleTime: Infinity });
export const useMissionJourney = (id?: string) => useQuery({ queryKey: ['journey', id], queryFn: () => api.missionJourney(id!), enabled: !!id, staleTime: Infinity });
export const usePlanJourney = (input: import('@/types/domain').PlanInput | null, launchSiteId?: string) =>
  useQuery({ queryKey: ['journey', 'plan', input, launchSiteId ?? 'ksc-lc-39a'], queryFn: () => api.planJourney(input!, launchSiteId), enabled: !!input, staleTime: Infinity });
export const useJourneyIndex = () => useQuery({ queryKey: ['journeys'], queryFn: api.journeys, staleTime: Infinity });
