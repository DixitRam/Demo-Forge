# The editor

## Editor

An icon rail on the right opens six panels:

| Panel | What it does |
| --- | --- |
| Script & voice | Narration lines on the timeline, drafted from the click log or written by hand, spoken by a local TTS |
| Background | Image / Colour / Gradient tabs — 18 generated wallpapers, custom upload, gradient presets with editable stops and angle |
| Zoom | Auto-zoom toggle, per-zoom or global scale, re-plan from the click log |
| Captions | Add at the playhead, draft a set from the click log, edit text, position / size / colour |
| Effects | Padding, corner radius, shadow blur / offset / strength |
| Layout | Output aspect — Original, 16:9, 9:16, 1:1, 4:3, 4:5 |
| Cursor | Show, click pulse, size, smoothing |

**Aiming a zoom.** Select a pill and the preview drops back to the unzoomed
frame with a rectangle showing exactly what that zoom will crop. Click or drag
anywhere on the frame to move it, and a floating inspector gives you the zoom
level, focus mode, reset and delete.

A zoom's focus is **auto** by default: it points at the nearest click, and
re-aims itself if you drag the pill somewhere else on the timeline. Placing a
point by hand switches it to **manual**, and nothing moves it again until you
reset it.

Captions are drawn over the frame but outside the zoom transform — a caption
belongs to the viewer, not to the picture, so it does not slide or grow when
the camera moves. **From clicks** drafts one cue per click out of the element
text the extension already recorded; that is string formatting, not AI.

**Cutting.** Press `T` to drop a cut at the playhead, then drag its edges;
`I` and `O` cut everything before or after the playhead. Cut spans are shaded
across every lane, playback jumps over them, and they are gone from the export
— video and audio both.

Cuts are the one place timeline time and source time come apart. The edit list
in `packages/core/src/edits.ts` owns that conversion, and the rule that keeps
it cheap is that **everything else stays in source time**: zoom keyframes,
captions, the cursor path and the event log are never remapped. The exporter
walks edited time, maps each frame back through `editedToSource()`, and
composites at a source timestamp exactly as the preview does.

The timeline has a scrubbable ruler with amber marks at every logged click, a
cut lane, a zoom lane, a caption lane, and a clip lane. **Ctrl+Scroll** zooms the view
about the pointer, **Shift+Scroll** pans, and the window follows the playhead.

| Key | |
| --- | --- |
| `Space` | play / pause |
| `Z` | add a zoom at the playhead |
| `C` | add a caption at the playhead |
| `N` | add a narration line at the playhead |
| `S` | save the project |
| `T` | cut a section out at the playhead |
| `I` `O` | cut everything before / after the playhead |
| `Delete` | remove the selection |
| `Esc` | deselect |
| `←` `→` | step one frame (hold `Shift` for a second) |
| `Home` `End` | jump to start / end |

Wallpapers are generated, not shipped — a base colour plus soft radial blobs,
painted by one function used for both the picker swatch and the full frame, so
the swatch cannot lie and there are no binary assets in the repo.
