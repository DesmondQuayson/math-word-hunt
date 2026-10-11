# Measurements (headless Chromium/WebKit on the development machine)

| Scenario | Tier | Avg frame ms | Worst frame ms | Draw calls | Triangles | Canvas px | JS heap MB | Models KB | Model load ms |
| --- | --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: |
| desktop 1366x768 | medium | 8.35 | 143 | 166 | 364198 | 634×360 | 58 | 5409 | 82 |
| desktop 1600x900 after 24 pulls | medium | 7.51 | 141.1 | 167 | 364200 | 746×424 | 61 | 5409 | 72 |
| device phone-390x844 | medium | 8.34 | 155.5 | 167 | 364200 | 364×113 | 58 | 5409 | 89 |
| device phone-430x932 | medium | 8.11 | 139.3 | 167 | 364200 | 404×178 | 58 | 5409 | 77 |
| device ipad-portrait-820x1180 | medium | 8.52 | 143.1 | 167 | 364200 | 794×349 | 61 | 5409 | 87 |
| device ipad-landscape-1180x820 | medium | 8.47 | 149.4 | 167 | 364200 | 545×310 | 61 | 5409 | 77 |
| device smart-board-1920x1080 | medium | 8.79 | 161.1 | 167 | 364200 | 902×512 | 58 | 5409 | 77 |
| device 4k-3840x2160 | medium | 8.6 | 160.5 | 167 | 364200 | 1837×1043 | 61 | 5409 | 76 |
| phone 390x844 low tier | low | 6 | 16.5 | 107 | 184184 | 364×113 | 58 | 5409 | 77 |
| webkit 1366x768 | medium | 6.82 | 492 | 167 | 364200 | 634×360 |  | 5409 | 83 |
