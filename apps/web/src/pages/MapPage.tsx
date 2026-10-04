import { LunarMap } from '@/map/LunarMap';

export function MapPage() {
  return (
    <div>
      <div className="page-head"><h1>Lunar map</h1><p className="dim">All catalogued CLPS landing sites and science regions on the LROC global mosaic.</p></div>
      <LunarMap />
    </div>
  );
}
