#!/usr/bin/env python3
"""
Download font woff2 files for self-hosting in Astro theme.
Uses google-webfonts-helper API (https://gwfh.mranftl.com) — reliable, always current.
Usage: python3 scripts/download_fonts.py
"""
import urllib.request
import json
import os

# Font IDs = slugs used by google-webfonts-helper API
FONT_IDS = ['montserrat', 'comfortaa', 'roboto', 'quicksand', 'oswald', 'inter',
            'frank-ruhl-libre', 'raleway', 'lato', 'open-sans', 'nunito', 'poppins']
WEIGHTS = ['regular', '600', '700']  # 400=regular, 600, 700
API_BASE = 'https://gwfh.mranftl.com/api/fonts'

base = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                    'astro-theme', 'public', 'fonts')
os.makedirs(base, exist_ok=True)

headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json',
}

for font_id in FONT_IDS:
    # Fetch font metadata
    api_url = f'{API_BASE}/{font_id}?subsets=latin&variants=regular,600,700'
    print(f'\n{font_id}:')
    try:
        req = urllib.request.Request(api_url, headers=headers)
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read())
    except Exception as e:
        print(f'  FAIL to fetch metadata: {e}')
        continue

    # Download each variant's woff2
    for variant in data.get('variants', []):
        variant_id = variant.get('id', '')
        woff2_url = variant.get('woff2', '')
        if variant_id not in ('regular', '600', '700'):
            continue
        if not woff2_url:
            continue

        weight = '400' if variant_id == 'regular' else variant_id
        filename = f'{font_id}-{weight}.woff2'
        out = os.path.join(base, filename)

        if os.path.exists(out) and os.path.getsize(out) > 1000:
            print(f'  exists: {filename}')
            continue

        print(f'  downloading: {filename} ...', end='', flush=True)
        try:
            req2 = urllib.request.Request(woff2_url, headers=headers)
            with urllib.request.urlopen(req2, timeout=15) as response, open(out, 'wb') as f:
                f.write(response.read())
            size = os.path.getsize(out)
            print(f' {size//1024}KB ✓')
        except Exception as e:
            print(f' FAIL: {e}')

print('\nDone.')

