"""Verify published static bytes against the exact deployment checkout.
No credentials or private game data are sent; only public app files are read.
"""
import hashlib
import os
import time
from urllib.request import Request, urlopen

base = os.environ["PAGES_URL"].rstrip("/") + "/"
paths = ["index.html", "styles.css", "sw.js", "js/app.js", "js/core/ai.js",
         "js/core/hand-analysis.js", "js/core/efficiency.js", "js/ui/furiten.js",
         "js/ui/trainers.js", "js/core/efficiency-report.js"]
for attempt in range(12):
    failures = []
    for path in paths:
        try:
            req = Request(base + path + "?verify=" + os.environ["GITHUB_SHA"],
                          headers={"Cache-Control": "no-cache"})
            with urlopen(req, timeout=20) as response:
                actual = response.read()
            with open(path, "rb") as source:
                expected = source.read()
            if hashlib.sha256(actual).digest() != hashlib.sha256(expected).digest():
                failures.append(path + ": bytes differ")
        except Exception as error:
            failures.append(path + ": " + str(error))
    if not failures:
        print("Published module graph matches " + os.environ["GITHUB_SHA"])
        print(base)
        break
    print("CDN verification attempt", attempt + 1, failures, flush=True)
    if attempt == 11:
        raise SystemExit("Published files did not converge to the deployment")
    time.sleep(10)
