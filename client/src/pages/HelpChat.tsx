import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowUp, Bot, Sparkles } from "lucide-react";
import { API_BASE } from "../api/http";
import { getAuthToken } from "../api/authToken";
import { isNative } from "../lib/platform";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const SUGGESTIONS = [
  "How do I post a plan?",
  "How do I join a plan?",
  "How does the chat work?",
  "How do I change my neighborhood?",
  "Why is my feed empty?",
  "How do invite codes work?",
];

async function buildHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (isNative()) {
    const token = await getAuthToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

export function HelpChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || streaming) return;

    const userMsg: Message = { role: "user", content: trimmed };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput("");
    setStreaming(true);
    setError(null);

    // Add a placeholder for the assistant reply
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      const headers = await buildHeaders();
      const res = await fetch(`${API_BASE}/api/helpchat`, {
        method: "POST",
        credentials: isNative() ? "omit" : "include",
        headers,
        body: JSON.stringify({ messages: nextMessages }),
      });

      if (!res.ok || !res.body) {
        throw new Error(`${res.status}: ${res.statusText}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6);
          if (raw === "[DONE]") break;
          try {
            const parsed = JSON.parse(raw) as { text?: string; error?: string };
            if (parsed.error) throw new Error(parsed.error);
            if (parsed.text) {
              setMessages((prev) => {
                const copy = [...prev];
                const last = copy[copy.length - 1];
                if (last?.role === "assistant") {
                  copy[copy.length - 1] = { ...last, content: last.content + parsed.text };
                }
                return copy;
              });
            }
          } catch {
            // ignore parse errors on individual chunks
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      // Remove the empty placeholder
      setMessages((prev) => {
        const copy = [...prev];
        if (copy[copy.length - 1]?.role === "assistant" && copy[copy.length - 1].content === "") {
          copy.pop();
        }
        return copy;
      });
    } finally {
      setStreaming(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send(input);
    }
  };

  const isEmpty = messages.length === 0;

  return (
    <main className="helpchat-shell">
      <header className="helpchat-header">
        <Link to="/settings" className="detail-back">
          <ArrowLeft size={16} strokeWidth={1.8} aria-hidden="true" /> Settings
        </Link>
        <div className="helpchat-header-title">
          <Bot size={16} strokeWidth={1.8} aria-hidden="true" />
          Help &amp; Support
        </div>
        <div className="helpchat-header-spacer" />
      </header>

      <div className="helpchat-body">
        {isEmpty ? (
          <div className="helpchat-empty">
            <div className="helpchat-empty-icon">
              <Sparkles size={28} strokeWidth={1.5} aria-hidden="true" />
            </div>
            <h2 className="helpchat-empty-title">How can I help?</h2>
            <p className="helpchat-empty-sub">
              Ask me anything about Commons — plans, chat, your profile, or how the app works.
            </p>
            <div className="helpchat-suggestions">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="helpchat-suggestion"
                  onClick={() => void send(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="helpchat-messages">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`helpchat-msg helpchat-msg--${msg.role}`}
              >
                {msg.role === "assistant" && (
                  <div className="helpchat-bot-avatar" aria-hidden="true">
                    <Bot size={14} strokeWidth={1.8} />
                  </div>
                )}
                <div className="helpchat-bubble">
                  {msg.content || (streaming && i === messages.length - 1 ? (
                    <span className="helpchat-typing">
                      <span /><span /><span />
                    </span>
                  ) : null)}
                </div>
              </div>
            ))}
            {error && (
              <p className="helpchat-error">{error}</p>
            )}
            <div ref={endRef} />
          </div>
        )}
      </div>

      <div className="helpchat-composer">
        <textarea
          ref={inputRef}
          className="helpchat-input"
          placeholder="Ask a question…"
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={streaming}
        />
        <button
          type="button"
          className="helpchat-send"
          aria-label="Send"
          disabled={!input.trim() || streaming}
          onClick={() => void send(input)}
        >
          <ArrowUp size={16} strokeWidth={2.2} aria-hidden="true" />
        </button>
      </div>
    </main>
  );
}
