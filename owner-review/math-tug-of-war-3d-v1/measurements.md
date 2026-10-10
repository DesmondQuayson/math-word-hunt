# Measurements (headless Chromium/WebKit on the development machine)

| Scenario | Tier | Avg frame ms | Worst frame ms | Draw calls | Triangles | Canvas px | JS heap MB | Models KB | Model load ms |
| --- | --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: |
| desktop 1366x768 | medium | 6.44 | 125 | 166 | 292204 | 634×360 | 45 | 4769 | 101 |
| desktop 1600x900 after 24 pulls | medium | 5.25 | 138 | 167 | 292206 | 746×424 | 48 | 4769 | 87 |
| device phone-390x844 | medium | 7.25 | 126.3 | 167 | 292206 | 364×113 | 45 | 4769 | 85 |
| device phone-430x932 | medium | 6.92 | 126.5 | 167 | 292206 | 404×178 | 48 | 4769 | 85 |
| device ipad-portrait-820x1180 | medium | 6.28 | 129.8 | 167 | 292206 | 794×349 | 51 | 4769 | 90 |
| device ipad-landscape-1180x820 | medium | 6.27 | 146.8 | 167 | 292206 | 545×310 | 51 | 4769 | 87 |
| device smart-board-1920x1080 | medium | 6.52 | 125.3 | 167 | 292206 | 902×512 | 45 | 4769 | 88 |
| device 4k-3840x2160 | medium | 6.62 | 131.6 | 167 | 292206 | 1837×1043 | 45 | 4769 | 89 |
| phone 390x844 low tier | low | 4.02 | 20.5 | 107 | 148187 | 364×113 | 45 | 4769 | 118 |
| webkit 1366x768 | medium | 7.67 | 455 | 167 | 292206 | 634×360 |  | 4769 | 80 |
