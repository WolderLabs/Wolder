import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createChatSession } from "./chat.js";
import { createStore } from "./api.js";

describe("chat session", () => {
  it("fences writes to the program files and reports denials", async () => {
    const dir = mkdtempSync(join(tmpdir(), "wolder-chat-"));
    mkdirSync(join(dir, "project", "src"), { recursive: true });
    const program = join(dir, "wolder.program.ts");
    writeFileSync(program, "// program\n");
    const store = createStore(program);
    store.program = { ok: true, graph: { root: join(dir, "project"), nodes: [], order: [], contracts: [] }, programFiles: [program] } as never;

    const decisions: Array<{ behavior: string }> = [];
    let captured: Record<string, unknown> = {};
    const fakeQuery = ((args: { prompt: string; options: Record<string, any> }) => {
      captured = args.options;
      return (async function* () {
        const can = args.options["canUseTool"];
        decisions.push(await can("Write", { file_path: join(dir, "project", "src", "x.ts") }));
        decisions.push(await can("Write", { file_path: program }));
        yield { type: "result", subtype: "success", result: "done" };
      })();
    }) as never;

    const events: Array<{ kind: string }> = [];
    const chat = createChatSession(store, { model: "m", query: fakeQuery });
    expect(await chat.send("hi", (e) => events.push(e))).toBe("done");

    expect(decisions.map((d) => d.behavior)).toEqual(["deny", "allow"]);
    expect(events.map((e) => e.kind)).toEqual(["denied"]);
    expect(captured["allowedTools"]).toEqual([]);
    expect(captured["maxTurns"]).toBe(40);
    expect(String(captured["systemPrompt"])).toMatch(/You edit the wolder program files only/);
    const server = (captured["mcpServers"] as any).wolder;
    expect(server.type).toBe("sdk");
    const tools = Object.keys(server.instance._registeredTools);
    expect(tools).toContain("node");
    expect(tools).not.toContain("run_start");
    expect(tools).not.toContain("program_edit");
  });
});
