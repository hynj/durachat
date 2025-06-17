const continentToRegion: Record<string, string> = {
  'EU': 'EU-1',
  'NA': 'US-1',
  'SA': 'US-1',  
  'AS': 'ASIA-1',
  'OC': 'OCEANIA-1',
  'AF': 'EU-1',
  'AN': 'US-1',
  'T1': 'US-1'
};

type RegionCode = "EU-1" | "US-1" | "ASIA-1" | "OCEANIA-1";

export function getRegion(region: string | null): RegionCode {
  return (region && continentToRegion[region] as RegionCode) || 'EU-1';
}
