#!/usr/bin/env python3
import json, sys

d = json.load(sys.stdin)
cats   = d.get('categories', {})
audits = d.get('audits', {})

score = cats.get('performance', {}).get('score', 0) * 100
print(f'Score: {score:.0f}')

for k in ['first-contentful-paint','largest-contentful-paint','total-blocking-time','cumulative-layout-shift','speed-index','interactive']:
    a = audits.get(k, {})
    print(f'  {k}: {a.get("displayValue","?")}  score={a.get("score","?")}')

print('\n--- Opportunities ---')
for k in ['render-blocking-resources','unused-css-rules','unused-javascript',
          'uses-text-compression','offscreen-images','uses-long-cache-ttl',
          'dom-size','bootup-time','network-requests','lcp-lazy-loaded',
          'prioritize-lcp-image','uses-responsive-images','uses-optimized-images',
          'efficient-animated-content','third-party-summary','mainthread-work-breakdown']:
    a = audits.get(k, {})
    sc = a.get('score', 1)
    if sc is not None and sc < 1:
        print(f'  [{sc:.2f}] {k}: {a.get("displayValue","")}')

print('\n--- LCP element ---')
lcp = audits.get('largest-contentful-paint-element', {})
items = lcp.get('details', {}).get('items', [])
for item in items[:3]:
    print(f'  {item}')
