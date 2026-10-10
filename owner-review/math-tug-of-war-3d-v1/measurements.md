# Measurements (headless Chromium/WebKit on the development machine)

| Scenario | Tier | Avg frame ms | Worst frame ms | Draw calls | Triangles | Canvas px | JS heap MB | Models KB | Model load ms |
| --- | --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: |
| desktop 1366x768 | medium | 5.59 | 223 | 160 | 292080 | 634×360 | 43 | 4768 | 103 |
| desktop 1600x900 after 24 pulls | medium | 5.21 | 226.5 | 161 | 292082 | 746×424 | 45 | 4768 | 99 |
| device phone-390x844 | medium | 5.94 | 225.6 | 161 | 292082 | 364×113 | 43 | 4768 | 100 |
| device phone-430x932 | medium | 5.56 | 220.4 | 161 | 292082 | 404×178 | 48 | 4768 | 82 |
| device ipad-portrait-820x1180 | medium | 5.33 | 229.4 | 161 | 292082 | 794×349 | 45 | 4768 | 87 |
| device ipad-landscape-1180x820 | medium | 5.38 | 221.4 | 161 | 292082 | 545×310 | 45 | 4768 | 88 |
| device smart-board-1920x1080 | medium | 5.7 | 216.3 | 161 | 292082 | 902×512 | 43 | 4768 | 84 |
| device 4k-3840x2160 | medium | 6.17 | 221.9 | 161 | 292082 | 1837×1043 | 48 | 4768 | 88 |
| phone 390x844 low tier | low | 4.1 | 11.3 | 107 | 148185 | 364×113 | 43 | 4768 | 93 |
| webkit 1366x768 | medium | 6.39 | 408 | 161 | 292082 | 634×360 |  | 4768 | 102 |
