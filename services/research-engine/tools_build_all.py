"""Smoke test: build every flight profile with the composed spec the API will send."""
import json, time, sys, math
from engine import journey as J
D = '../api/src/data/'
profiles = json.load(open(D + 'flight-profiles.json'))
pads = {p['id']: p for p in json.load(open(D + 'launch-sites.json'))}
sites = {s['id']: s for s in json.load(open(D + 'landing-sites.json'))}
missions = {m['id']: m for m in json.load(open(D + 'missions.json'))}
PRESET = {'peregrine': 'generic-clps-100kg', 'nova-c': 'nova-c', 'blue-ghost': 'blue-ghost', 'griffin': 'generic-clps-100kg', 'blue-moon-mk1': 'generic-clps-100kg'}
only = sys.argv[1:] 
out = {}
for prof in profiles:
    mid = prof["missionId"]
    if only and mid not in only: continue
    m = missions[mid]
    spec = {k: v for k, v in prof.items() if k not in ('missionId', 'launchSiteId')}
    spec['id'] = mid
    spec['launchSite'] = pads[prof['launchSiteId']]
    spec['vehicle'] = m['launch']['vehicle']
    spec['landerPresetId'] = PRESET.get(m.get('landerId') or m.get('spacecraftId'), 'generic-clps-100kg')
    ls = sites.get(m.get('landingSiteId'))
    if ls: spec['landingSite'] = {'id': ls['id'], 'name': ls['name'], 'latitude': ls.get('latitude'), 'longitude': ls.get('longitude')}
    t0 = time.time()
    try:
        j = J.build(spec)
    except Exception as e:
        print(f'{mid:24s} FAILED: {e!r}'); import traceback; traceback.print_exc(); continue
    dt = time.time() - t0
    st = j['stats']
    tl = next((s for s in j['segments'] if s['id'] == 'translunar'), None)
    rmin = min(math.hypot(x, y, z) for _, x, y, z in tl['samples']) if tl else float('nan')
    # segment continuity
    gaps = []
    for a, b in zip(j['segments'], j['segments'][1:]):
        if a['frame'] == b['frame']:
            gaps.append(math.dist(a['samples'][-1][1:], b['samples'][0][1:]))
    size = len(json.dumps(j)) / 1024
    tli = next((e for e in j['events'] if e['id'] == 'tli'), None)
    print(f"{mid:24s} {dt:5.2f}s {size:6.0f}kB incl {st.get('launchPlaneInclinationDeg')} tliΔv {st.get('tliDeltaVMps')} injΔv {st.get('injectionDeltaVMps')} "
          f"tof {st.get('transferDays')}d v∞ {st.get('arrivalVInfKms')} loiΔv {st.get('loiDeltaVMps')} alt {st.get('lunarOrbitAltitudeKm')} rmin {rmin:.0f} maxgap {max(gaps) if gaps else 0:.2f} tli {tli['utc'] if tli else None}")
    for n in j['notes']: print('     note:', n)
    out[mid] = j
json.dump(out, open('/tmp/journeys.json', 'w'))
