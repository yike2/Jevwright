# Archify Rules

- The HTML is the final display version. Link it first when replying.
- One diagram, one folder: `docs/archify/<diagram-slug>/` with no timestamp. The folder is published through GitHub Pages, so its URL must stay stable.
- To revise an existing diagram, edit its `candidate.json` and re-run `finalize` into the same folder, overwriting the HTML in place. Delete the old `index.browser-check.json` first, or `finalize` refuses to overwrite it. Never create a new folder for a new version of the same diagram.
- Create a new folder only for a genuinely different diagram.
- Diagram only: omit `cards` unless the user explicitly asks for explanatory cards.
- All diagram text is English: set `meta.locale` to `"en"` and write every label, sublabel, boundary, message and note in English.
- Default style is editorial: set `meta.visual_preset` to `"editorial"` in every `candidate.json`.
- Default theme is light. Archify has no option for this, so after every `finalize` run `python3 docs/archify/default-light.py <diagram.html>`. The reader can still switch to dark with the theme toggle, or with `?theme=dark` in the URL.
