# @opencraw/captcha-tesseract

A captcha reader for [OpenCraw](../../README.md): it reads the code in an image captcha with Tesseract and fills
the form's answer field. The engine then posts the form, checks the page and retries.

It is meant for simple image captchas: a short code drawn in a clean font, like the public Vahan registrations
report's. Widget captchas (reCAPTCHA, hCaptcha, Turnstile) are behavioural checks with no text to read, and need a
widget solver instead.

```sh
npm install @opencraw/captcha-tesseract
```

Tesseract runs in WebAssembly, and the English model ships in the package, so nothing is downloaded at run time.

## Use

Register the reader as a captcha solver:

```js
// plugins.mjs (opencraw run --plugins plugins.mjs), or createCrawler({ captchaSolvers })
import { tesseractReader } from '@opencraw/captcha-tesseract'

export const captchaSolvers = [
  tesseractReader({
    charset:       '1-9A-HJ-NP-Zabdefghnqrtu', // the characters the site draws: a list with ranges, or /[A-HJ-NP-Z2-9]/
    length:        6,             // a read of any other length is refreshed, never submitted
    caseSensitive: true,
    audit:         (read) => console.log(read.outcome, read.text, read.confidence),
  }),
]
```

Then name it in a form captcha step, placed after the steps that fill the form:

```json
{ "type": "captcha", "solver": "tesseract",
  "image":   "#captchaImage",
  "refresh": "#captchaImg",
  "field":   "#externalCaptcha",
  "submit":  [ { "type": "click", "selector": "#applyTrigger" } ],
  "verify":  { "selector": "#makerDynamicReportHeader", "failure": "#captchaMsg" },
  "attempts": 5 }
```

## What one solve does

1. **Wait for the image to settle.** Changing a filter can make a page draw a new captcha in the background, so the
   reader waits until the image's `src` stops changing.
2. **Screenshot the image element.** It never downloads the `src` again: many sites draw a new code on every
   request, so a second download would show a different code from the one on screen.
3. **Clean the image.**
   - Scale it up 3× smoothly, before thresholding, so curves stay curves and an `8` stays an `8`.
   - Threshold it to black ink on white. Otsu's method picks the cut, and light-on-dark text is inverted.
   - Pad it with a white margin.
   - Optionally, a median filter removes speckle.
4. **Read it with Tesseract,** as one line of text, limited to the `charset`.
5. **Fix the case of look-alike letters** (with `caseSensitive`):
   - `c o s u v w x z` are told from their capitals by height, against the capitals and digits on the same line;
   - `p` and `y` by the tail under the line.

   Tesseract reads one line with no size reference, so it cannot tell `o` from `O` on its own.
6. **Check the read.** Only characters from the charset are kept. The read must be exactly `length` characters,
   and every character must be read with at least `minConfidence`. The least sure character decides, because
   Tesseract's whole-word confidence is too noisy for six loose characters.
7. **Cross-check it** (`crossCheck`, on by default). Tesseract reads a line with context, and it can bend a
   character to fit its neighbours: a `4` after lowercase letters comes out `a` or `d`, at 90% confidence or more,
   so no confidence threshold catches it. The reader pulls the characters apart (a white gap between each run of
   inked columns) and reads the image again. The read passes only when both reads agree.
8. **Refresh or fill.**
   - A read that fails the check makes the reader click `refresh` and read again, up to `refreshes` times. It
     never submits it. This is the only check possible before the form is posted, and it is free: refreshing
     posts no form and risks no lockout. A last character cut off by the image's edge is the usual failure.
   - A read that passes goes into the `field`, and the reader returns `solved`.

The engine then runs `submit`, reads `verify.selector` (accepted) or `verify.failure` (refused), and gives the
verdict back to the reader, which passes it to `audit`.

## Options

| Option | Default | What it is |
|---|---|---|
| `name` | `tesseract` | The name recipes use. Register several readers under different names, one per site. |
| `charset` | `A-Za-z0-9` | The characters the captcha uses: a list with `a-z` ranges, or a one-character RegExp class. |
| `length` | any | The code's length, or `[min, max]`. |
| `caseSensitive` | `false` | Whether `a` and `A` differ. When `false`, each letter allows its other case too. |
| `minConfidence` | 30 | The least confidence (0–100) every character must have. A floor against junk reads: on real images the cross-check, not the confidence, catches the wrong reads. |
| `crossCheck` | `true` | Read the image a second time with the characters spaced apart, and submit only when both reads agree. |
| `refreshes` | 5 | Reads (each after a refresh) before an attempt gives up. |
| `preprocess` | | `{ scale: 3, threshold: 'otsu', invert: 'auto', median: false, padding: 10 }` |
| `pageSegMode` | 7 | Tesseract page segmentation: `7` one line, `8` one word, `13` a raw line. `7` measured best. |
| `lang`, `langPath` | the bundled English model | Another Tesseract language, and where its `.traineddata.gz` is. |
| `timeoutMs` | 60000 | Time one attempt may take, refreshes included, when the recipe sets none. |
| `audit` | | Called for every read. A throw is logged and ignored. |

`reader.read(png)` reads a PNG without a page, for measuring a site's captchas offline.
`reader.close()` stops the Tesseract worker; the crawler calls it when it closes.

## The audit

Each read reaches `audit` once, with:
- `text` (filtered) and `raw` (as Tesseract read it), and `second` (the cross-check's read, when one was made);
- `confidence` (the least sure character) and `symbols` (each character with its confidence and box);
- `image` and `cleaned` (PNG buffers of the captured image and of what Tesseract saw);
- `url`, `attempt`, `read` (the read within the attempt), `durationMs`;
- `outcome`, plus `reason` when it failed:
  - `refreshed`: failed the check, never submitted;
  - `rejected`: submitted, and the site refused it;
  - `solved`: submitted, and the site accepted it.

Every `solved` record pairs an image with its confirmed text. Use them to narrow `charset` to what the site really
draws, to set `minConfidence`, or later to fine-tune a Tesseract model for the site. To collect them without a
working reader, run the built-in `manual` solver headed: a person types the codes.

## Accuracy

**Real Vahan images** (`e2e/corpus/vahan`): 100 captchas from the public report, collected on 2026-09-26 and
labelled by hand. A read is submitted **right**, submitted **wrong** (the site refuses it; a form post and a page
load lost), or **refused** (refreshed for free, never submitted):

| Settings | Right | Wrong | Refused |
|---|---|---|---|
| The site's charset, cross-check (the defaults otherwise) | 73 | 1 | 26 |
| The site's charset, no cross-check | 78 | 6 | 16 |
| `A-Za-z0-9`, no cross-check | 71 | 12 | 17 |

- **Name the charset the site really uses.** In 600 labelled characters, 16 never appear: `0 I O` and the
  lowercase letters that look like capitals or like other glyphs (`c i j k l m o p s v w x y z`). Allowing
  them doubles the wrong reads: `1` read as `l`, `J` as `j`.
- **Keep the cross-check.** It turns 5 of the 6 remaining wrong reads into refreshes. The one left is an image
  whose last character is cut off by its edge. A captcha takes 1.35 reads per submitted code on average, and
  1.01 posts per solved one.
- **`minConfidence` barely matters.** The wrong reads are sure ones (90% and more). From 0 to 50 the threshold
  only refuses right reads (75 right at 0, 73 at 30, 70 at 50), and catches none of the wrong ones once the
  cross-check is on.
- **Clipped images** (16 of the 100, the last character cut off by the image's edge) are refused or read right,
  except that one.

**The synthetic e2e corpus:** 6-character mixed-case codes drawn like the Vahan report's, but with every letter
of both cases. Over 80 codes, with the cross-check, 75% are right, 16% refused, 9% wrong. The misses are the
letters mixed case makes ambiguous (`j`/`J`, `s`/`S`, `y`/`Y`): both reads agree on the wrong case.

Solving a site's captcha can break its terms of service. Read OpenCraw's [captcha guide](../../docs/recipes/captcha.md)
first.
