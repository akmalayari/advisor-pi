import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import advisorPiExtension, { STATE_ENTRY, buildExecutorGuidance, defaultConfig, makeStateEntry } from "../dist/index.js";

const MODELS = [{ provider: "openai-codex", id: "gpt-5.6-sol" }];
const BASE_PROMPT = "You are the executor.";

function withAgentDir(run) {
  const previous = process.env.PI_CODING_AGENT_DIR;
  const root = mkdtempSync(join(tmpdir(), "advisor-pi-cache-"));
  process.env.PI_CODING_AGENT_DIR = root;
  return Promise.resolve(run()).finally(() => {
    if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previous;
    rmSync(root, { recursive: true, force: true });
  });
}

// Starts the extension on a session branch where `useCount` advisor calls were
// already made, and returns the executor system prompt it produces.
async function systemPromptAfterUses(useCount) {
  const handlers = new Map();
  let activeTools = [];
  const api = {
    registerFlag() {},
    getFlag() { return undefined; },
    registerTool() {},
    registerCommand() {},
    on(name, handler) { handlers.set(name, handler); },
    appendEntry() {},
    getActiveTools() { return activeTools; },
    setActiveTools(next) { activeTools = next; },
  };
  advisorPiExtension(api);

  const known = new Map(MODELS.map((model) => [`${model.provider}/${model.id}`, model]));
  const branch = [{ type: "custom", customType: STATE_ENTRY, data: makeStateEntry(defaultConfig(), useCount) }];
  const context = {
    hasUI: false,
    modelRegistry: {
      find: (provider, modelId) => known.get(`${provider}/${modelId}`),
      getAvailable: () => [...MODELS],
    },
    sessionManager: { getBranch: () => branch },
  };

  await handlers.get("session_start")({}, context);
  const result = await handlers.get("before_agent_start")({ systemPrompt: BASE_PROMPT }, context);
  return result.systemPrompt;
}

describe("executor system prompt stays cache-stable", () => {
  it("does not change as advisor uses are spent", async () => {
    await withAgentDir(async () => {
      const fresh = await systemPromptAfterUses(0);
      const afterTwo = await systemPromptAfterUses(2);
      const atLimit = await systemPromptAfterUses(defaultConfig().maxUses);
      assert.equal(afterTwo, fresh);
      assert.equal(atLimit, fresh);
      assert.ok(fresh.startsWith(`${BASE_PROMPT}\n\n`));
    });
  });

  it("still tells the executor the per-branch limit and where to find the count", () => {
    const guidance = buildExecutorGuidance({ ...defaultConfig(), maxUses: 7 });
    assert.match(guidance, /at most 7 calls per session branch/);
    assert.match(guidance, /used\/max/);
    assert.doesNotMatch(guidance, /remaining/);
  });
});
