"""Build the compact globe textures and country index from Natural Earth 1:10m GeoJSON."""
import json
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "content/ne_10m_admin_0_countries.geojson"
ASSETS = ROOT / "assets"
ID_SIZE = (4096, 2048)
BORDER_SIZE = (2048, 1024)

with SOURCE.open(encoding="utf-8") as f:
    features = json.load(f)["features"]

def country_code(props):
    code = props.get("ISO_A3_EH") or props.get("ISO_A3")
    if code in (None, "-99"):
        code = props.get("ADM0_A3")
    return str(code)

codes = sorted({country_code(f["properties"]) for f in features})
ids = {code: i + 1 for i, code in enumerate(codes)}
names = {}
for feature in features:
    props = feature["properties"]
    code = country_code(props)
    names.setdefault(code, props.get("ADMIN") or props.get("NAME") or code)

def project(ring, size):
    width, height = size
    return [
        (round((max(-180, min(180, lon)) + 180) * (width - 1) / 360),
         round((90 - max(-90, min(90, lat))) * (height - 1) / 180))
        for lon, lat, *_ in ring
    ]

idmap = Image.new("RGB", ID_SIZE, (0, 0, 0))
id_draw = ImageDraw.Draw(idmap)
borders = Image.new("RGBA", BORDER_SIZE, (0, 0, 0, 0))
border_draw = ImageDraw.Draw(borders)

for feature in features:
    props = feature["properties"]
    cid = ids[country_code(props)]
    color = (cid & 255, (cid >> 8) & 255, 0)
    geometry = feature["geometry"]
    polygons = [geometry["coordinates"]] if geometry["type"] == "Polygon" else geometry["coordinates"]
    for polygon in polygons:
        if not polygon:
            continue
        id_draw.polygon(project(polygon[0], ID_SIZE), fill=color)
        for hole in polygon[1:]:
            id_draw.polygon(project(hole, ID_SIZE), fill=(0, 0, 0))
        for ring in polygon:
            border_draw.line(project(ring, BORDER_SIZE), fill=(218, 218, 218, 125), width=1, joint="curve")

idmap.save(ASSETS / "globe-country-ids.png", optimize=True)
borders.save(ASSETS / "globe-country-borders.png", optimize=True)
index = {
    "source": "Natural Earth 1:10m Admin 0 Countries, version 5.1.1; public domain; de facto boundaries",
    "encoding": "24-bit RGB integer ID (R + 256*G), black is ocean",
    "countries": [{"id": ids[code], "isoA3": code, "name": names[code]} for code in codes],
}
(ASSETS / "globe-countries.json").write_text(json.dumps(index, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
print(f"Built {len(codes)} country IDs from {len(features)} features")
