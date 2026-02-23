#!/usr/bin/env python3
import json, sys, urllib.request

def check(url, label):
    api = f"https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url={url}&strategy=mobile&category=performance"
    with urllib.request.urlopen(api) as r:
        d = json.loads(r.read())
    audits = d.get('lighthouseResult', {}).get('audits', {})
    cats   = d.get('lighthouseResult', {}).get('categories', {})
    score  = cats.get('performance', {}).get('score', 0) * 100
    print(f"\n=== {label} MOBILE score: {score:.0f} ===")
    for k in ['first-contentful-paint','largest-contentful-paint','total-blocking-time','cumulative-layout-shift','speed-index','interactive']:
        a = audits.get(k, {})
        print(f"  {k}: {a.get('displayValue','?')}  score={a.get('score','?')}")
    print("-- Opportunities --")
    for k in ['render-blocking-resources','unused-css-rules','unused-javascript',
              'uses-text-compression','uses-long-cache-ttl','offscreen-images',
              'uses-responsive-images','uses-optimized-images','dom-size',
              'bootup-time','mainthread-work-breakdown','network-requests']:
        a = audits.get(k, {})
        sc = a.get('score', 1)
        if sc is not None and sc < 0.9:
            print(f"  [{sc}] {k}: {a.get('displayValue','')}  savings={a.get('details',{}).get('overallSavingsMs','')}")

check("https://upwork1.tester-buyreadysite.website", "AZOTEA upwork1")
check("https://upwork2.tester-buyreadysite.website", "KP-SERVICES upwork2")
