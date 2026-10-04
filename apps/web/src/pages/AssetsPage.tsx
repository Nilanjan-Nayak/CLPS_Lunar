import { useAssets } from '@/services/queries';
import { useAssetStore } from '@/state/assetStore';
import { Badge } from '@/ui/primitives';
import { fmtBytes } from '@/utils/format';

/** Asset registry view: NASA source, credit, license, scientific grade + live lifecycle state from the AssetManager. */
export function AssetsPage() {
  const { data } = useAssets();
  const records = useAssetStore((s) => s.records);
  return (
    <div>
      <div className="page-head"><h1>NASA asset registry</h1><p className="dim">Visual assets (GLB/textures) and scientific datasets (LOLA elevation) are catalogued separately with provenance. Lifecycle column is live.</p></div>
      <table className="table">
        <thead><tr><th>Asset</th><th>Type</th><th>Grade</th><th>Source / credit</th><th>License</th><th>Size</th><th>Lifecycle</th></tr></thead>
        <tbody>
          {data?.assets.map((a) => (
            <tr key={a.assetId}>
              <td><b>{a.name}</b><div className="small mono dim">{a.assetId}</div></td>
              <td>{a.assetType}{a.lod != null ? ` · LOD${a.lod}` : ''}<div className="small dim">{a.format}</div></td>
              <td>{a.scientificGrade === true ? <Badge tone="ok">scientific</Badge> : a.scientificGrade === 'derived' ? <Badge tone="info">derived</Badge> : <Badge>visual</Badge>}</td>
              <td className="small"><a href={a.source?.url} target="_blank" rel="noreferrer">{a.source?.title ?? a.source?.organization}</a><div>{a.credits ?? a.source?.credit}</div></td>
              <td className="small">{a.license ? <a href={a.license.url} target="_blank" rel="noreferrer">{a.license.name}</a> : '—'}</td>
              <td className="mono small">
                {fmtBytes(a.sizeBytes)}
                {a.width && a.height ? <div className="dim">{a.width}×{a.height}</div> : null}
                {a.variants?.map((v) => (
                  <div key={v.url} className="dim" title={v.url}>{v.quality ?? 'variant'}: {v.width}×{v.height} · {fmtBytes(v.sizeBytes)}</div>
                ))}
              </td>
              <td className="mono small">{records[a.assetId]?.status ?? '—'}{records[a.assetId]?.refs ? ` (${records[a.assetId].refs} refs)` : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
