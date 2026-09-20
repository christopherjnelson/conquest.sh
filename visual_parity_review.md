# Visual parity review

This is a direct, side-by-side visual review of [ref.png](ref.png) against the five final **actual xterm-client** captures. It reviews composition, legibility, and terminal presentation at the captured states; it does not claim a pixel match or evaluate game rules, networking, or protocol behavior.

## Capture coverage

| Capture | State | Terminal size | Rendered occupancy |
| --- | --- | --- | --- |
| [visual_wide_lobby.png](visual_wide_lobby.png) | One-player lobby | 200 x 55 | 132/132 width, 36/36 height |
| [visual_standard_lobby.png](visual_standard_lobby.png) | One-player lobby | 140 x 45 | 96/102 width, 30/30 height |
| [visual_wide_active.png](visual_wide_active.png) | Two-player deployment | 200 x 55 | 132/132 width, 36/36 height |
| [visual_standard_active.png](visual_standard_active.png) | Two-player deployment | 140 x 45 | 96/102 width, 30/30 height |
| [visual_selected_territory.png](visual_selected_territory.png) | Standard active, real Tab selection | 140 x 45 | 96/102 width, 30/30 height |
| [visual_four_player_active.png](visual_four_player_active.png) | Custom four-player deployment | 200 x 55 | 132/132 width, 36/36 height |

## Findings

### map scale — PASS

The final map uses the available map pane decisively at both terminal sizes and keeps the legend inside the geography. The revised wide macro now carries the central and eastern territory mass across the map while preserving readable labels and the scale legend (`visual_wide_active.png`); standard remains fully occupied within its 96/102-cell render width.

### landmass silhouette — PASS

The wide frame shows the repaired stepped C3 north coast and the final E3/F1 opposing angled capes rather than a horizontal bridge (`visual_wide_active.png`). The result remains intentionally terminal-pixel based rather than a pixel match for the reference's outlined terrain, while retaining separated, coherent land groups.

### dead space — PASS

`visual_standard_lobby.png` and `visual_standard_active.png` use the compact viewport well vertically, and the reduced event log returns rows to the map. In the wide map, the final paired E3/F1 capes reduce the former central corridor to a narrow navigable strait; remaining water reads as separation between land groups rather than an unused band (`visual_wide_active.png`).

### sidebar proportions — PASS

The final sidebar is about a quarter of the wide layout and roughly two sevenths of the standard layout, which preserves map priority while retaining readable cards. `visual_standard_lobby.png` keeps an empty inspector compact; `visual_standard_active.png` contains all four action rows without reaching into Session Intel.

### visual hierarchy — PASS

The map has the strongest frame and heading, while Players, Selected Territory, and Actions use quieter borders than the cyan map boundary. `visual_wide_lobby.png` also keeps the lobby Ready control and session information visually subordinate to the map instead of creating a large empty side card.

### label readability — PASS

The wide active frame shows full `FROSTFELL` and `GLACIER BAY` labels, and labels remain inside their territories without joined lines (`visual_wide_active.png`). At standard width, the abbreviated/positioned territory labels are still readable in `visual_standard_active.png`; this is a terminal adaptation rather than an attempted copy of the reference's larger labels.

### event log height — PASS

The final log is deliberately shallow: it occupies four visible rows of content at standard size and about five at wide size, leaving map height available. This is shorter than the reference log, but it meets the final layout objective and does not obscure footer navigation (`visual_standard_active.png`, `visual_wide_active.png`).

### selected territory — PASS

`visual_selected_territory.png` shows a real selected A1 inspector with distinct identity, Owner, Armies, Region, Bonus, neighbors, and flavor rows. Values no longer collide with dividers, neighbor chips stay above the flavor line, and the compact card remains contained at 140 x 45.

### ownership colors — PASS

The two-player active frames clearly distinguish cyan and amber ownership (`visual_wide_active.png`). The final supplementary custom-room frame, `visual_four_player_active.png`, verifies four live player colors—cyan, amber, pink/magenta, and green—across actual assigned territories; the final map also carries sparse interior terrain grain.

## Verification gate

The reported full gate is **160 tests passing** with **typecheck passing**. The captures above were taken from actual xterm clients, with clean isolated lobby/active sessions; no `testRender` images were used.
