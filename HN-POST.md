# Hacker News submission package

> Copy-paste ready. Fill the two link placeholders before posting.
> Tone rule: state facts, admit limits, no exclamation marks, no marketing adjectives.

---

## ① Title

```
Show HN: An ink-wash (sumi-e) renderer in pure math, no ML, no deps
```

---

## ② Body

```
This is a procedural Chinese ink-wash (sumi-e) landscape renderer. By our own
estimate, and a reviewer's, it is roughly 6/10. I am posting it because the
failure trail is more interesting than the current output.

Repo: https://github.com/chinatian2000-png/inkwash
Demo (no signup, renders on load): https://chinatian2000-png.github.io/inkwash/

WHY IT IS NOT AI

Three falsifiable claims:
 - Determinism. The same seed produces a byte-identical PNG every time. I verify
   this by rendering twice and comparing hashes. A sampling model at temperature
   > 0 cannot promise this.
 - No model. There is no weights file, no tokenizer, no inference runtime. The
   entire renderer is 463 lines of dependency-free JavaScript.
 - Readability. Every visual decision maps to a named operation. If you dislike
   the output you can change one constant and predict what happens.

It runs entirely in the browser. No network access at render time.

WHAT IT ACTUALLY DOES

A seeded PRNG feeds value-noise fBm. Mountain silhouettes are built from ridged
multifractals. Three depth bands get air perspective. Then a brush engine draws
strokes: pressure curve, ink depletion L(t) = L0 * exp(-lambda * integral of
a(s) ds), and bristle splitting -- the outer bristles run dry first, so
"flying white" (fei bai) is a mechanical consequence rather than added noise.

A 900x1200 frame takes about 0.5s. Three sliders in the demo control ink load,
stroke count, and how fast the brush runs dry.

THE PART THAT DID NOT WORK

Twelve architectures; eleven of them wrong. All twelve frames are in the repo,
unretouched.

1. Iso-contours. fBm -> threshold -> contour lines -> fill. This reads as a DEM,
   not a painting. The reason is topological, not cosmetic: iso-contours of a
   smooth scalar field are equidistant, continuous, and have no endpoints. A
   brush stroke has a start, an end, a taper, and a pressure curve. Those
   properties are not in the primitive, so no threshold or palette tuning
   produces them.

2. LIC-style streamlines. Trace streamlines perpendicular to the gradient of a
   noise field. Around every local extremum of a scalar field, the perpendicular
   streamlines form closed orbits. A noise field has many extrema, so long
   integrations inevitably wind into loops. This is a property of the field --
   not fixable by tuning step size, stroke count, or opacity. The result is a
   tangle of noodles.

3. Smooth wash with strokes sprinkled on top. This stopped the looping, but a
   stroke sitting on blank paper reads as a scratch. Adding a multi-scale blur
   to the wash gave the mass a believable ink quality and turned the strokes
   into uniform mechanical hatching. Quantising the wash to five tonal levels
   produced posterised bands instead.

4. Ridge skeleton plus a real brush engine. This is architecturally where it
   should be: the skeleton is a recursive ridge tree, every point gets local
   parameters (along-slope u, cross-slope v), and the down-slope direction field
   is derived from it, so stroke direction has a physical meaning. The brush
   engine implements pressure, depletion, and bristles. But we could not
   calibrate it: enough strokes to build a mass gives a black blob; few enough
   to stay legible gives faint scratches that never read as a stroke.

WHAT IS STILL BROKEN

A stroke still does not read as a stroke. The mechanism that should fix it is
identified (bristle splitting plus depletion, with stroke direction and spacing
driven by the ridge skeleton's (u, v) field). Our calibration of that mechanism
is not there. The current picture is closer to "edge-detected noise with an ink
wash" than to brushwork, and I would rather say that up front than have it
pointed out.

TWO RESULTS THAT ARE PROVABLY IMPOSSIBLE, NOT MERELY UNTUNED

 - Brushwork cannot be produced by iso-contours of a smooth field, because
   contours have no endpoints and strokes do.
 - LIC on a noise field necessarily closes into loops, because the perpendicular
   streamlines orbit every local extremum.

Both are negative results. Both are why the architecture had to change rather
than the parameters.

WHERE HELP WOULD ACTUALLY MATTER

 - Calibrating the brush engine: stroke counts, lengths, and widths per tonal
   layer, and how a family of strokes should relate to the underlying ridge
   field. If you have done NPR or Chinese brush simulation, this is the part
   that is stuck.
 - Whether the wash and the texture strikes should be decoupled further.
 - Porting the whole thing to a shader once the mark-making is right. Right now
   it is CPU JavaScript because readability and determinism mattered more.

MIT licensed. Contributions welcome.
```

---

## ③ First comment

```
Two things I want to say before anyone else does.

First: this is not brushwork. It is edge-detection plus noise wearing an ink
wash. I know exactly what is missing -- the bristle-splitting behaviour is
implemented but not calibrated, so strokes still read as marks rather than as
strokes -- and I would rather state that than defend it.

Second, and this is the honest summary of the project: I could describe the
defect precisely for three rounds before I could draw a stroke.

A few technical points people usually ask about:

- Determinism is the load-bearing claim. Rendering the same seed twice gives a
  byte-identical PNG. That is what makes the "no ML" claim checkable rather than
  rhetorical. It is one command:
      node tools/render.js --seed 7 --w 900 --h 1200 --out a.png
  run it twice and compare.

- Why CPU JavaScript and not a shader. Two reasons. The brush is a per-sample
  simulation with per-bristle state, which is an awkward fit for a fragment
  shader; and while the mark-making is still wrong, being able to read and step
  through the code mattered more than speed. A 900x1200 frame is 0.5s. If the
  marks ever get right, porting is the obvious next step.

- The two negative results are the parts I am most confident about. Contours of
  a smooth field have no endpoints; strokes do. And LIC on a noise field orbits
  local extrema, so it closes into loops. Both are properties of the maths, not
  of my parameters, which is why changing parameters never helped.

- What I would ask for specifically. If you have worked on NPR or brush
  simulation: how should a family of strokes be distributed over a ridge field
  so that it reads as form rather than as texture? The skeleton gives me
  (u, v) per point and a down-slope direction, and I have not found the
  placement rule that turns that into calligraphy.

The twelve failed frames are in out/lessons/ in order, each labelled with what
was tried and why it failed. They are unretouched.
```

---

## ④ When to post

**Recommended: Monday 2026-10-12, 08:00 Beijing time (= 00:00 UTC).**

Rationale, from the Show HN data we collected (188,085 posts):

| Slot | Chance of 50+ points |
|---|---|
| **Monday 00:00 UTC** | **10.8%** (best measured) |
| worst measured slot | 2.6% |

Two operational notes:

- **Budget 2–3 hours of presence right after posting.** Half-life is 24h; the
  first 60–90 minutes decide placement. A Show HN that nobody answers questions
  on dies.
- **Do not ask anyone to upvote.** Coordinated voting is detected at 5–6
  accounts and the penalty is permanent. This is not a soft rule.

---

## ⑤ Three likely hostile questions, with one-line answers

**Q1. "This is just edge-detect and noise. Why should I care?"**
> Correct, and I said so in the first comment. The part I would defend is the
> trail: two of the four approaches are provably impossible, not merely untuned,
> and the negative results are written down with the frames that demonstrate them.

**Q2. "Why is this not a shader? WebGL would be 100x faster."**
> Because the brush is per-sample stateful simulation, and because while the
> marks are still wrong, readable CPU code is worth more than speed. 0.5s per
> frame is enough for a demo. Porting is the obvious next step once the
> mark-making is right.

**Q3. "You shipped something you admit is 6/10. Isn't this just fishing for clicks?"**
> The score is in the first line, the failure gallery is the main image, and the
> repo contains every wrong frame. If it were fishing, the 6/10 and the twelve
> failures would be the first things removed. The useful artefact here is the
> documented dead ends, and two of them are provable.

**Backup, if asked "how is this different from <existing procedural ink project>":**
> Most of those are 3D terrain with an NPR pass, or a post-process filter over a
> photo. There is no 3D scene here and no input image: it is a 2D ink model with
> an explicit brush, drawn from a seeded field. The other difference is that I
> am publishing the failures rather than only the best frame.
