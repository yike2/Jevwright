"""Generate candidate.json for the Jevwright Run sequence diagram.

Edit P (lanes) or M (stages and messages), then run:
  python3 .archify/jevwright-sequence/gen.py
y coordinates, stage bands and activation bars are derived from M.
"""
import json
import os

P = [
    ("api", "backend", "API + Worker", "queue · WebSocket"),
    ("pipeline", "backend", "Run Pipeline", "orchestration"),
    ("syntax", "backend", "Syntax", "YAML parsing"),
    ("executor", "backend", "Step Executor", "runs steps"),
    ("locator", "backend", "Locator", "find element"),
    ("asserter", "backend", "Asserter", "judge assert"),
    ("driver", "cloud", "Browser Driver", "Playwright"),
    ("harness", "external", "Jev Harness", "Jev model"),
    ("report", "backend", "Report", "build report"),
]

# A 1-tuple starts a stage; a 5-tuple is (from, to, label, variant, note).
# "Alt —" stages are failure branches; the main path continues after them.
M = [
    ("Dequeue",),
    ("api", "pipeline", "run(yaml, onEvent)", "emphasis", "Web UI POSTs /runs; Worker calls after dequeue"),
    ("pipeline", "syntax", "analyze(yaml)", "default", None),
    ("Alt — invalid YAML",),
    ("syntax", "pipeline", "Diagnostic[] (line, column)", "return", None),
    ("pipeline", "api", "Run failed: diagnostics", "return", "Run ends here; no browser is launched"),
    ("Parse OK",),
    ("syntax", "pipeline", "TestCase", "return", None),
    ("Step 1: click (selector misses, visual fails)",),
    ("pipeline", "executor", "execute(TestCase)", "emphasis", None),
    ("executor", "driver", "launch()", "default", None),
    ("driver", "executor", "page", "return", None),
    ("executor", "locator", "locate(page, step)", "default", "step has selector · target"),
    ("locator", "driver", "query(selector)", "default", None),
    ("driver", "locator", "no match", "return", None),
    ("locator", "driver", "screenshot()", "default", None),
    ("driver", "locator", "screenshot", "return", None),
    ("locator", "harness", "locate(screenshot, target)", "default", "Retries on bad Jev output"),
    ("harness", "locator", "not found / low confidence", "return", None),
    ("locator", "driver", "extractDOM()", "default", None),
    ("driver", "locator", "interactive elements", "return", None),
    ("locator", "harness", "locate(DOM list, target)", "default", None),
    ("harness", "locator", "choice · confidence", "return", None),
    ("locator", "executor", "element position", "return", None),
    ("executor", "driver", "click(position)", "default", None),
    ("driver", "executor", "ok", "return", None),
    ("executor", "pipeline", "onEvent(step1 passed)", "dashed", None),
    ("pipeline", "api", "onEvent(step1 passed)", "dashed", "Pushed to Web UI over WebSocket"),
    ("Alt — DOM locate or action fails",),
    ("locator", "executor", "not found", "return", "Or driver returns error / timeout on the action"),
    ("executor", "driver", "screenshot()", "default", None),
    ("driver", "executor", "screenshot (evidence)", "return", None),
    ("executor", "pipeline", "onEvent(step1 failed)", "dashed", "Remaining steps are skipped; go to Finish"),
    ("Step 2: assert (Playwright fails, Jev passes)",),
    ("executor", "asserter", "assert(page, step)", "default", "step has selector · text · statement"),
    ("asserter", "driver", "toContainText(text)", "default", None),
    ("driver", "asserter", "failed", "return", None),
    ("asserter", "driver", "screenshot()", "default", None),
    ("driver", "asserter", "screenshot", "return", None),
    ("asserter", "harness", "judge(screenshot, statement)", "default", None),
    ("harness", "asserter", "true · confidence", "return", None),
    ("asserter", "executor", "passed (fallback)", "return", "Marked as a fallback pass in the report"),
    ("Alt — Jev judges false",),
    ("harness", "asserter", "false · confidence", "return", None),
    ("asserter", "executor", "failed + reason", "return", None),
    ("executor", "pipeline", "onEvent(step2 failed)", "dashed", "Remaining steps are skipped; go to Finish"),
    ("Finish (always)",),
    ("executor", "driver", "close()", "default", None),
    ("driver", "executor", "trace.zip", "return", None),
    ("executor", "pipeline", "StepResult[] · trace", "return", None),
    ("pipeline", "report", "build(results, trace)", "default", None),
    ("report", "pipeline", "Report .json (passed / failed)", "return", None),
    ("pipeline", "api", "Report", "return", "Worker stores it and pushes Run passed / failed"),
]

STEP, NOTE_STEP, SEG_GAP = 44, 84, 26

y, msgs, segs, cur = 160, [], [], None
for m in M:
    if len(m) == 1:
        if cur:
            cur["to"] = y - 14
            segs.append(cur)
        cur = {"from": y - 10, "label": m[0]}
        y += SEG_GAP
        continue
    src, dst, label, variant, note = m
    msg = {"id": f"m{len(msgs) + 1}", "from": src, "to": dst, "y": y, "label": label, "variant": variant}
    if note:
        msg["note"] = note
    msgs.append(msg)
    y += NOTE_STEP if note else STEP
cur["to"] = y - 14
segs.append(cur)

acts = []
for pid, typ, _, _ in P:
    ys = [m["y"] for m in msgs if pid in (m["from"], m["to"])]
    acts.append({"participant": pid, "from": min(ys) - 5, "to": max(ys) + 6, "type": typ})

doc = {
    "schema_version": 1,
    "diagram_type": "sequence",
    "meta": {
        "title": "Jevwright Run Sequence",
        "locale": "en",
        "output": ".archify/jevwright-sequence/index.html",
        "quality_profile": "showcase",
        "visual_preset": "editorial",
    },
    "participants": [{"id": i, "type": t, "label": l, "sublabel": s} for i, t, l, s in P],
    "segments": segs,
    "messages": msgs,
    "activations": acts,
}
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "candidate.json")
json.dump(doc, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print(f"{len(msgs)} messages, last y {msgs[-1]['y']} -> {out}")
