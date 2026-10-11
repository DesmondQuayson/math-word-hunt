# Measurements (headless Chromium/WebKit on the development machine)

| Scenario | Tier | Avg frame ms | Worst frame ms | Draw calls | Triangles | Canvas px | JS heap MB | Models KB | Model load ms |
| --- | --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: |
| desktop 1366x768 | medium | 7.86 | 148.4 | 166 | 377090 | 634×360 | 58 | 5331 | 75 |
| desktop 1600x900 after 24 pulls | medium | 7.94 | 145.8 | 167 | 377092 | 746×424 | 61 | 5331 | 82 |
| device phone-390x844 | medium | 8.41 | 168.1 | 167 | 377092 | 364×113 | 58 | 5331 | 77 |
| device phone-430x932 | medium | 8.01 | 164.6 | 167 | 377092 | 404×178 | 58 | 5331 | 82 |
| device ipad-portrait-820x1180 | medium | 8.15 | 168.4 | 167 | 377092 | 794×349 | 61 | 5331 | 86 |
| device ipad-landscape-1180x820 | medium | 7.94 | 150.2 | 167 | 377092 | 545×310 | 61 | 5331 | 80 |
| device smart-board-1920x1080 | medium | 7.37 | 146.6 | 167 | 377092 | 902×512 | 58 | 5331 | 75 |
| device 4k-3840x2160 | medium | 8 | 161.1 | 167 | 377092 | 1837×1043 | 58 | 5331 | 77 |
| phone 390x844 low tier | low | 6.29 | 17 | 107 | 190630 | 364×113 | 58 | 5331 | 85 |
| webkit 1366x768 | medium | 6.8 | 520 | 167 | 377092 | 634×360 |  | 5331 | 69 |
