import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildDemo } from "../demo/build-demo.ts";

test("demo builder: a short run produces answers, comments, aggregates and insights", () => {
  const dir = mkdtempSync(join(tmpdir(), "engine-demo-"));
  try {
    const s = buildDemo({ out: join(dir, "demo.db"), days: 5 });
    assert.equal(s.people, 1200);
    assert.ok(s.accounts > 300);
    assert.ok(s.answers >= s.accounts * 5 * 2, `answers ${s.answers}`);
    assert.ok(s.comments > 0);
    assert.ok((s.insights.domain_state ?? 0) > 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
