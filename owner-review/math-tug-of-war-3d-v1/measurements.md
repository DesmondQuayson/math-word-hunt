# Measurements (headless Chromium/WebKit on the development machine)

| Scenario | Tier | Avg frame ms | Worst frame ms | Draw calls | Triangles | Canvas px | JS heap MB | Models KB | Model load ms |
| --- | --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: |
| desktop 1366x768 | medium | 7.65 | 153.2 | 166 | 364198 | 634×360 | 61 | 5409 | 75 |
| desktop 1600x900 after 24 pulls | medium | 8.13 | 141.1 | 167 | 364200 | 746×424 | 58 | 5409 | 82 |
| device phone-390x844 | medium | 7.65 | 142.2 | 167 | 364200 | 364×113 | 61 | 5409 | 71 |
| device phone-430x932 | medium | 7.43 | 140 | 167 | 364200 | 404×178 | 58 | 5409 | 81 |
| device ipad-portrait-820x1180 | medium | 7.49 | 142.4 | 167 | 364200 | 794×349 | 58 | 5409 | 87 |
| device ipad-landscape-1180x820 | medium | 7.14 | 145.7 | 167 | 364200 | 545×310 | 61 | 5409 | 76 |
| device smart-board-1920x1080 | medium | 7.86 | 140 | 167 | 364200 | 902×512 | 58 | 5409 | 81 |
| device 4k-3840x2160 | medium | 8.11 | 146 | 167 | 364200 | 1837×1043 | 61 | 5409 | 81 |
| phone 390x844 low tier | low | 6.75 | 16.5 | 107 | 184184 | 364×113 | 54 | 5409 | 79 |
| webkit 1366x768 | medium | 6.84 | 502 | 167 | 364200 | 634×360 |  | 5409 | 92 |
