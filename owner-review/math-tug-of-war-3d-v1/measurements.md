# Measurements (headless Chromium/WebKit on the development machine)

| Scenario | Tier | Avg frame ms | Worst frame ms | Draw calls | Triangles | Canvas px | JS heap MB | Models KB | Model load ms |
| --- | --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: |
| desktop 1366x768 | medium | 5.43 | 131.5 | 166 | 292204 | 634×360 | 45 | 4769 | 100 |
| desktop 1600x900 after 24 pulls | medium | 6.53 | 126.1 | 167 | 292206 | 746×424 | 45 | 4769 | 87 |
| device phone-390x844 | medium | 5.51 | 123.8 | 167 | 292206 | 364×113 | 48 | 4769 | 108 |
| device phone-430x932 | medium | 6.19 | 130.3 | 167 | 292206 | 404×178 | 48 | 4769 | 91 |
| device ipad-portrait-820x1180 | medium | 6.43 | 126 | 167 | 292206 | 794×349 | 43 | 4769 | 115 |
| device ipad-landscape-1180x820 | medium | 6.24 | 123.8 | 167 | 292206 | 545×310 | 45 | 4769 | 80 |
| device smart-board-1920x1080 | medium | 5.4 | 126.7 | 167 | 292206 | 902×512 | 45 | 4769 | 105 |
| device 4k-3840x2160 | medium | 6.55 | 132.8 | 167 | 292206 | 1837×1043 | 48 | 4769 | 84 |
| phone 390x844 low tier | low | 4.12 | 15.2 | 107 | 148187 | 364×113 | 45 | 4769 | 92 |
| webkit 1366x768 | medium | 7.98 | 432 | 167 | 292206 | 634×360 |  | 4769 | 83 |
