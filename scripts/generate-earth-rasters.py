"""Generate deterministic terminal land rasters from Natural Earth 1:110m land polygons.

Input: Natural Earth public domain 1:110m land polygons (version 4.0.0):
https://www.naturalearthdata.com/downloads/110m-physical-vectors/110m-land/
Convert the source to GeoJSON named ne_110m_land.geojson. The runtime uses only
the checked-in output. Run with: python3 scripts/generate-earth-rasters.py input.geojson
"""
import json, math, re, sys
from pathlib import Path

source = Path('packages/map-engine/src/maps/earth-42.ts').read_text()
neighbor_block = source.split('const adjacency: Record<string, string[]> = {', 1)[1].split('\n};', 1)[0]
neighbors = {key: set(re.findall(r'"([a-z]{2}_[a-z_]+)"', values))
             for key, values in re.findall(r'  ([a-z]{2}_[a-z_]+): \[([^\]]*)\]', neighbor_block)}
# Preserve the authored order and region from the six group blocks.
records = []
region = None
for line in source.splitlines():
    match = re.search(r'\{ id: "(na|sa|eu|af|as|oc)", name:', line)
    if match: region = match.group(1)
    for match in re.finditer(r'\["([a-z_]+)", "[^"]+",\s*(-?\d+),\s*(-?\d+),\s*"[^"]+"\]', line):
        records.append((region + '_' + match.group(1), int(match.group(2)), int(match.group(3)), region))
assert len(records) == 42, len(records)
symbols = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!$%&*+=?@^~'
geo = json.loads(Path(sys.argv[1]).read_text())
polys = []
for feature in geo['features']:
    geometry = feature['geometry']
    if geometry['type'] == 'Polygon': shapes = [geometry['coordinates']]
    elif geometry['type'] == 'MultiPolygon': shapes = geometry['coordinates']
    else: continue
    for shape in shapes:
        outer = shape[0]
        xs = [pt[0] for pt in outer]; ys = [pt[1] for pt in outer]
        polys.append((min(xs), max(xs), min(ys), max(ys), shape))

def inside_ring(lon, lat, ring):
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        ax, ay = ring[i]; bx, by = ring[j]
        if (ay > lat) != (by > lat) and lon < (bx-ax) * (lat-ay) / (by-ay) + ax:
            inside = not inside
        j = i
    return inside

def land(lon, lat):
    for x0,x1,y0,y1,shape in polys:
        if x0 <= lon <= x1 and y0 <= lat <= y1 and inside_ring(lon, lat, shape[0]):
            if not any(inside_ring(lon,lat,hole) for hole in shape[1:]): return True
    return False

def continent(lon,lat):
    if lon < -31:
        return 'na' if lat >= 10 else 'sa'
    if lon < 43 and lat > 36: return 'eu'
    if lon < 52 and -37 < lat <= 36: return 'af'
    if lat < -10 and lon > 100: return 'oc'
    if lon > 95 and lat < 5: return 'oc'
    if lon > 130 and lat < 10: return 'oc'
    return 'as'

def nearest(lon,lat, region):
    candidates = [(i,r) for i,r in enumerate(records) if r[3] == region]
    def dist(r):
        _,x,y,_ = r
        dx = (lon-x)*math.cos(math.radians((lat+y)/2))
        return dx*dx + (lat-y)**2 * 1.12
    return min(candidates,key=lambda pair:dist(pair[1]))[0]

def retain_dominant_component(rows, symbol, minimum_cells=4):
    """Remove raster specks that are not part of a territory's main silhouette.

    Natural Earth's small offshore polygons can become disconnected fragments when
    this strategic partition is sampled at terminal resolution.  We only apply
    this to territories whose main landmass was materially weakened by those
    fragments; deliberate archipelagos retain their authored island chains.
    """
    height, width = len(rows), len(rows[0])
    cells = {(x, y) for y in range(height) for x in range(width) if rows[y][x] == symbol}
    components = []
    while cells:
        start = cells.pop()
        component = {start}
        pending = [start]
        while pending:
            x, y = pending.pop()
            for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                if (nx, ny) in cells:
                    cells.remove((nx, ny))
                    component.add((nx, ny))
                    pending.append((nx, ny))
        components.append(component)
    if len(components) < 2:
        return
    largest = max(components, key=len)
    for component in components:
        if component is largest:
            continue
        for x, y in component:
            rows[y][x] = '.'
    # A three-microcell island reads as a broken punctuation mark after terminal
    # borders and labels are applied. Grow only into adjacent water, keeping the
    # outline connected without crossing into another strategic territory.
    while len(largest) < minimum_cells:
        candidates = []
        for x, y in largest:
            for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                if 0 <= nx < width and 0 <= ny < height and rows[ny][nx] == '.':
                    candidates.append((nx, ny))
        if not candidates:
            break
        nx, ny = min(candidates, key=lambda pos: (pos[1], pos[0]))
        rows[ny][nx] = symbol
        largest.add((nx, ny))

def has_marker_run(rows, symbol, needed=4):
    """Whether a territory has `needed` whole terminal cells in one row."""
    for my in range(0, len(rows) - 1, 2):
        run = 0
        for x in range(len(rows[0])):
            run = run + 1 if rows[my][x] == symbol and rows[my + 1][x] == symbol else 0
            if run >= needed:
                return True
    return False

def add_marker_run(rows, symbol, tid, target_x, target_my):
    """Extend a territory through water to make a four-cell army-count run."""
    height, width = len(rows), len(rows[0])
    candidates = []
    for my in range(0, height - 1, 2):
        for x in range(0, width - 3):
            own = 0
            valid = True
            block = {(bx, by) for by in (my, my + 1) for bx in range(x, x + 4)}
            for bx, by in block:
                value = rows[by][bx]
                if value == symbol: own += 1
                elif value != '.': valid = False
            if not valid or own == 0:
                continue
            # The new coastline may meet only water, this territory, or a
            # declared neighbor. A one-cell perimeter is enough because the
            # normal contact-carving pass follows this construction step.
            for bx, by in block:
                for nx, ny in ((bx + 1, by), (bx - 1, by), (bx, by + 1), (bx, by - 1)):
                    if not (0 <= nx < width and 0 <= ny < height) or (nx, ny) in block:
                        continue
                    other = rows[ny][nx]
                    if other != '.' and other != symbol and ids[other] not in neighbors[tid]:
                        valid = False
            if not valid:
                continue
            distance = abs(x + 1.5 - target_x) + abs(my + 0.5 - target_my) * 0.75
            candidates.append((distance - own * 0.25, x, my))
    if not candidates:
        return False
    _, x, my = min(candidates)
    for y in (my, my + 1):
        for px in range(x, x + 4):
            rows[y][px] = symbol
    return True

out = {}
for profile,w,h in [('compact',96,24),('compact-tall',96,30),('standard',124,34),('wide',144,38),
                    ('large',160,42),('ultra',190,42)]:
    rows = []
    for my in range(h*2):
        lat = 82 - (my+0.5) / (h*2) * 142
        row = []
        for x in range(w):
            lon = -180 + (x+0.5) / w * 360
            if land(lon,lat): row.append(symbols[nearest(lon,lat,continent(lon,lat))])
            else: row.append('.')
        rows.append(row)
    # Retain small island territories that may disappear at coarse resolution.
    for i,(tid,lon,lat,region) in enumerate(records):
        if any(symbols[i] in row for row in rows): continue
        x = max(0,min(w-1,round((lon+180)/360*w)))
        y = max(0,min(h*2-1,round((82-lat)/142*h*2)))
        rows[y][x] = symbols[i]
        if x+1 < w: rows[y][x+1] = symbols[i]
    # Western Europe falls on a two-microcell North Atlantic sliver in the
    # 96×30 sampling. Extend that existing coast by one terminal row so its
    # owned army marker can show a bounded `[100+]` count. This is deliberately
    # confined to the compact-tall raster; the higher-density profiles retain
    # the unmodified Natural Earth partition.
    if profile == 'compact-tall':
        west = records.index(next(record for record in records if record[0] == 'eu_western_europe'))
        cx = round((-2 + 180) / 360 * (w - 1))
        my = round((82 - 45) / 142 * (h * 2 - 1))
        my += my % 2
        for y in (my, my + 1):
            for x in range(max(0, cx - 5), min(w, cx + 5)):
                rows[y][x] = symbols[west]
    # Tiny geographic/island regions need a clear in-territory army count.
    # Add only a four-cell terminal run connected to existing land and through
    # water; this keeps the silhouette intact while avoiding false borders.
    ids = {symbol: rec[0] for symbol,rec in zip(symbols,records)}
    for i, (tid, lon, lat, _region) in enumerate(records):
        if has_marker_run(rows, symbols[i]):
            continue
        target_x = round((lon + 180) / 360 * (w - 1))
        target_my = round((82 - lat) / 142 * (h * 2 - 1))
        add_marker_run(rows, symbols[i], tid, target_x, target_my)
    # Keep archipelagos as separate islands. For mainland territories, sampled
    # offshore specks make misleading detached fronts at terminal resolution.
    island_groups = {'as_japan', 'oc_indonesia', 'oc_new_guinea'}
    for i, (tid, *_rest) in enumerate(records):
        if tid not in island_groups:
            retain_dominant_component(rows, symbols[i])
    # Strategic borders cannot silently imply a move the graph forbids. Cut a
    # one-microcell sea/strait gap at contacts between non-neighbors.
    for _ in range(8):
        bad = []
        sizes = {symbol: sum(row.count(symbol) for row in rows) for symbol in ids}
        for y in range(h*2):
            for x in range(w):
                a = rows[y][x]
                if a == '.': continue
                for dx,dy in ((1,0),(0,1)):
                    nx,ny = x+dx,y+dy
                    if nx >= w or ny >= h*2: continue
                    b = rows[ny][nx]
                    if b == '.' or b == a or ids[b] in neighbors[ids[a]]: continue
                    cut = (x,y,a) if sizes[a] >= sizes[b] else (nx,ny,b)
                    bad.append(cut)
        if not bad: break
        for x,y,symbol in bad:
            if sizes[symbol] > 3:
                rows[y][x] = '.'
                sizes[symbol] -= 1
    # Cutting an illegal contact can strand a one-cell shard; apply the same
    # mainland coherence rule after all strategic straits have been carved.
    for i, (tid, *_rest) in enumerate(records):
        if tid not in island_groups:
            retain_dominant_component(rows, symbols[i])
    out[profile] = [''.join(row) for row in rows]
    print(profile,w,h,'territories',len(set(''.join(out[profile]))-{'.'}))
Path('packages/map-engine/src/maps/generated/earth-rasters.ts').write_text(
    '// Generated from Natural Earth 1:110m land polygons; public domain.\n'
    '// See scripts/generate-earth-rasters.py for the deterministic construction.\n'
    'export const EARTH_RASTERS: Record<string, string[]> = '
    + json.dumps(out,indent=2) + ';\n')
