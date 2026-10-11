# Measurements (headless Chromium/WebKit on the development machine)

| Scenario | Tier | Avg frame ms | Worst frame ms | Draw calls | Triangles | Canvas px | JS heap MB | Models KB | Model load ms |
| --- | --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: |
| desktop 1366x768 | medium | 5.38 | 136.7 | 166 | 292204 | 634×360 | 45 | 4769 | 87 |
| desktop 1600x900 after 24 pulls | medium | 7.5 | 155.5 | 167 | 292206 | 746×424 | 48 | 4769 | 95 |
| device phone-390x844 | medium | 7.62 | 159.9 | 167 | 292206 | 364×113 | 48 | 4769 | 84 |
| device phone-430x932 | medium | 7.07 | 159.5 | 167 | 292206 | 404×178 | 48 | 4769 | 79 |
| device ipad-portrait-820x1180 | medium | 6.96 | 139.6 | 167 | 292206 | 794×349 | 51 | 4769 | 82 |
| device ipad-landscape-1180x820 | medium | 7.09 | 160.3 | 167 | 292206 | 545×310 | 51 | 4769 | 94 |
| device smart-board-1920x1080 | medium | 8.03 | 143.1 | 167 | 292206 | 902×512 | 45 | 4769 | 83 |
| device 4k-3840x2160 | medium | 7.64 | 162.3 | 167 | 292206 | 1837×1043 | 45 | 4769 | 86 |
| phone 390x844 low tier | low | 5.7 | 23.6 | 107 | 148187 | 364×113 | 43 | 4769 | 81 |
| webkit 1366x768 | medium | 7.05 | 537 | 167 | 292206 | 634×360 |  | 4769 | 71 |
