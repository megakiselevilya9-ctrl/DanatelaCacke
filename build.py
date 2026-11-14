#!/usr/bin/env python3
"""Build the static Danatela PWA; Python 3.10+, no third-party packages.

Run from anywhere: python build.py
Only the known generated files in ./dist are overwritten.
"""
from pathlib import Path
import hashlib
import json
import math
import struct
import zipfile
import zlib

ROOT = Path(__file__).resolve().parent
DIST = ROOT / 'dist'
OUTPUTS = {'index.html', 'pwa.js', 'manifest.webmanifest', 'sw.js', 'icon.svg',
           'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png'}


def rgb(value):
    return tuple(int(value[i:i + 2], 16) for i in (1, 3, 5))


PINK, MILK, BERRY, ICING, TOP, PLATE = map(rgb, [
    '#f4dce1', '#fffaf5', '#863f56', '#e5b6c8', '#f8e2e9', '#e2cece'])


def icon_pixel(x, y):
    """Vector-like cake mark. Important art is within the maskable safe circle."""
    color = PINK
    r = math.hypot(x - .5, y - .5)
    if r < .365:
        color = BERRY if r > .354 else MILK
    # Lowercase d, drawn as shapes instead of using a system font.
    ring = math.hypot(x - .485, y - .365)
    if .045 < ring < .064 or (.532 < x < .553 and .257 < y < .415):
        color = BERRY
    # Plate, cake sides, top and piping.
    if ((x - .5) / .266) ** 2 + ((y - .733) / .041) ** 2 < 1:
        color = PLATE
    if .26 < x < .74 and .534 < y < .692:
        color = ICING
    if ((x - .5) / .24) ** 2 + ((y - .691) / .043) ** 2 < 1:
        color = ICING
    if ((x - .5) / .24) ** 2 + ((y - .535) / .052) ** 2 < 1:
        color = TOP
    if .274 < x < .726:
        wave = .59 + .021 * abs(math.sin((x - .274) * math.pi * 6 / .452))
        if abs(y - wave) < .006:
            color = BERRY
    for i in range(11):
        angle = math.pi * i / 10
        px, py = .5 + .226 * math.cos(angle), .534 + .046 * math.sin(angle)
        if (x - px) ** 2 + (y - py) ** 2 < .009 ** 2:
            color = MILK
    return color


def png_icon(size):
    """Opaque RGB PNG, 2x antialiasing, correct IHDR dimensions and CRCs."""
    rows = bytearray()
    for py in range(size):
        rows.append(0)  # PNG filter type None
        for px in range(size):
            samples = [icon_pixel((px + dx) / size, (py + dy) / size)
                       for dy in (.25, .75) for dx in (.25, .75)]
            rows.extend(sum(sample[channel] for sample in samples) // 4 for channel in range(3))

    def chunk(kind, data):
        return struct.pack('!I', len(data)) + kind + data + struct.pack('!I', zlib.crc32(kind + data) & 0xffffffff)

    return (b'\x89PNG\r\n\x1a\n'
            + chunk(b'IHDR', struct.pack('!IIBBBBB', size, size, 8, 2, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(bytes(rows), 9)) + chunk(b'IEND', b''))


def main():
    manifest = json.loads((ROOT / 'manifest.webmanifest').read_text(encoding='utf-8'))
    assert manifest['start_url'] == './' and manifest['scope'] == './'
    assert manifest['display'] == 'standalone'
    html = (ROOT / 'danatela-local.html').read_text(encoding='utf-8')
    assert 'id="fillingsTab"' in html and 'fillingSnapshot' in html
    template = (ROOT / 'sw.js').read_text(encoding='utf-8')
    assert '__BUILD_ID__' in template
    DIST.mkdir(exist_ok=True)
    unexpected = {path.name for path in DIST.iterdir()} - OUTPUTS
    if unexpected:
        raise RuntimeError('Unexpected files in dist; refusing to publish them: ' + ', '.join(sorted(unexpected)))
    (DIST / 'index.html').write_text(html, encoding='utf-8')
    for name in ['pwa.js', 'manifest.webmanifest', 'icon.svg']:
        (DIST / name).write_bytes((ROOT / name).read_bytes())
    for name, size in [('icon-192.png', 192), ('icon-512.png', 512),
                       ('icon-maskable-512.png', 512), ('apple-touch-icon.png', 180)]:
        (DIST / name).write_bytes(png_icon(size))
    digest = hashlib.sha256(template.encode('utf-8'))
    for name in sorted(OUTPUTS - {'sw.js'}):
        digest.update(name.encode('utf-8'))
        digest.update((DIST / name).read_bytes())
    version = digest.hexdigest()[:16]
    (DIST / 'sw.js').write_text(template.replace('__BUILD_ID__', version), encoding='utf-8')
    for icon in manifest['icons']:
        assert (DIST / icon['src'].removeprefix('./')).is_file()
    with zipfile.ZipFile(ROOT / 'danatela-pwa-site.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
        for name in sorted(OUTPUTS):
            archive.write(DIST / name, name)
    print(f'Built Danatela PWA {version}: {len(OUTPUTS)} public files in dist/')
    print('Local preview: python -m http.server 8080 --directory dist')
    print('Site archive: danatela-pwa-site.zip (generated, not customer data)')


if __name__ == '__main__':
    main()
