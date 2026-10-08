import { useRef, useState } from "react";

interface Msg {
  role: "user" | "assistant" | "error";
  text: string;
}
interface ChatEvent {
  kind?: string;
  name?: string;
  detail?: string;
  text?: string;
  done?: boolean;
  error?: string;
}

/** Chat with the fenced agent. Streams NDJSON events as a one-line activity indicator. */
export function ChatView({ onTurnEnd }: { onTurnEnd: () => void }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [activity, setActivity] = useState("");
  const bottom = useRef<HTMLDivElement>(null);

  const handle = (line: string) => {
    if (!line.trim()) return;
    const e = JSON.parse(line) as ChatEvent;
    if (e.done) {
      setMessages((m) => [
        ...m,
        e.error ? { role: "error", text: e.error } : { role: "assistant", text: e.text ?? "" },
      ]);
    } else if (e.kind === "tool") setActivity(`${e.name}${e.detail ? ` ${e.detail}` : ""}`);
    else if (e.kind === "denied") setActivity(`denied ${e.name}`);
    else if (e.kind === "text") setActivity(e.text ?? "");
  };

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setBusy(true);
    setMessages((m) => [...m, { role: "user", text }]);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok || !res.body) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `chat failed (${res.status})`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        lines.forEach(handle);
      }
      handle(buf);
    } catch (err) {
      setMessages((m) => [...m, { role: "error", text: (err as Error).message }]);
    } finally {
      setBusy(false);
      setActivity("");
      onTurnEnd();
      setTimeout(() => bottom.current?.scrollIntoView(), 0);
    }
  };

  return (
    <div className="chat-view">
      <div className="messages">
        {messages.length === 0 && (
          <div className="muted">Ask about the graph, or ask for a change to the program.</div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>
            {m.text}
          </div>
        ))}
        {busy && <div className="activity">{activity || "thinking..."}</div>}
        <div ref={bottom} />
      </div>
      <form
        className="chat-input"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Message the program agent"
          disabled={busy}
        />
        <button type="submit" disabled={busy || !input.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}
