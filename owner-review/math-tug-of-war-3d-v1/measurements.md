# Measurements (headless Chromium/WebKit on the development machine)

| Scenario | Tier | Avg frame ms | Worst frame ms | Draw calls | Triangles | Canvas px | JS heap MB | Models KB | Model load ms |
| --- | --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: |
| desktop 1366x768 | medium | 8.15 | 140.5 | 166 | 364198 | 634×360 | 58 | 5409 | 90 |
| desktop 1600x900 after 24 pulls | medium | 7.5 | 144.8 | 167 | 364200 | 746×424 | 58 | 5409 | 75 |
| device phone-390x844 | medium | 8 | 153 | 167 | 364200 | 364×113 | 61 | 5409 | 76 |
| device phone-430x932 | medium | 7.83 | 139.4 | 167 | 364200 | 404×178 | 58 | 5409 | 81 |
| device ipad-portrait-820x1180 | medium | 8.04 | 138.1 | 167 | 364200 | 794×349 | 58 | 5409 | 78 |
| device ipad-landscape-1180x820 | medium | 8.37 | 158.7 | 167 | 364200 | 545×310 | 58 | 5409 | 74 |
| device smart-board-1920x1080 | medium | 7.94 | 141.8 | 167 | 364200 | 902×512 | 58 | 5409 | 74 |
| device 4k-3840x2160 | medium | 8.02 | 129.8 | 167 | 364200 | 1837×1043 | 61 | 5409 | 73 |
| phone 390x844 low tier | low | 5.63 | 17.6 | 107 | 184184 | 364×113 | 54 | 5409 | 89 |
| webkit 1366x768 | medium | 6.69 | 451 | 167 | 364200 | 634×360 |  | 5409 | 109 |
