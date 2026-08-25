import React, { useEffect, useRef, useState } from "react";
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

// ── Inline markdown renderer ────────────────────────────────────────────────
// Handles: **bold**, *italic*, `code`, ### headings, - bullet lists, numbered
// lists, blank-line paragraphs. No external deps.

interface Token {
  type: "heading" | "bullet" | "ordered" | "paragraph" | "blank";
  level?: number;
  items?: string[];
  text?: string;
}

function tokenize(md: string): Token[] {
  const lines = md.split("\n");
  const tokens: Token[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Headings
    const hm = line.match(/^(#{1,3})\s+(.*)/);
    if (hm) {
      tokens.push({ type: "heading", level: hm[1].length, text: hm[2] });
      i++;
      continue;
    }

    // Bullet list block
    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*]\s+/, ""));
        i++;
      }
      tokens.push({ type: "bullet", items });
      continue;
    }

    // Ordered list block
    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s+/, ""));
        i++;
      }
      tokens.push({ type: "ordered", items });
      continue;
    }

    // Blank line
    if (line.trim() === "") {
      tokens.push({ type: "blank" });
      i++;
      continue;
    }

    // Paragraph — accumulate until blank or block element
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^(#{1,3}\s|[-*]\s|\d+\.\s)/.test(lines[i])
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    tokens.push({ type: "paragraph", text: paraLines.join(" ") });
  }

  return tokens.filter((t) => t.type !== "blank");
}

type InlinePart = string | React.ReactElement;

function renderInline(text: string): InlinePart[] {
  const parts: InlinePart[] = [];
  const re = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;

  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    if (m[2] !== undefined) parts.push(<strong key={key++}>{m[2]}</strong>);
    else if (m[3] !== undefined) parts.push(<em key={key++}>{m[3]}</em>);
    else if (m[4] !== undefined) parts.push(<code key={key++} className="helpchat-code">{m[4]}</code>);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function MarkdownMessage({ content }: { content: string }) {
  const tokens = tokenize(content);
  return (
    <div className="helpchat-md">
      {tokens.map((tok, i) => {
        if (tok.type === "heading") {
          const Tag = tok.level === 1 ? "h2" : tok.level === 2 ? "h3" : "h4";
          return <Tag key={i} className={`helpchat-md-h${tok.level ?? 2}`}>{renderInline(tok.text ?? "")}</Tag>;
        }
        if (tok.type === "bullet") {
          return (
            <ul key={i} className="helpchat-md-list">
              {tok.items!.map((item, j) => (
                <li key={j} className="helpchat-md-li">{renderInline(item)}</li>
              ))}
            </ul>
          );
        }
        if (tok.type === "ordered") {
          return (
            <ol key={i} className="helpchat-md-list helpchat-md-ol">
              {tok.items!.map((item, j) => (
                <li key={j} className="helpchat-md-li">{renderInline(item)}</li>
              ))}
            </ol>
          );
        }
        return <p key={i} className="helpchat-md-p">{renderInline(tok.text ?? "")}</p>;
      })}
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

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

    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      const headers = await buildHeaders();
      const res = await fetch(`${API_BASE}/api/helpchat`, {
        method: "POST",
        credentials: isNative() ? "omit" : "include",
        headers,
        body: JSON.stringify({ messages: nextMessages }),
      });

      if (!res.ok || !res.body) throw new Error(`${res.status}: ${res.statusText}`);

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
            /* ignore chunk parse errors */
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
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
              <div key={i} className={`helpchat-msg helpchat-msg--${msg.role}`}>
                {msg.role === "assistant" && (
                  <div className="helpchat-bot-avatar" aria-hidden="true">
                    <Bot size={14} strokeWidth={1.8} />
                  </div>
                )}
                <div className="helpchat-bubble">
                  {msg.role === "assistant" ? (
                    msg.content ? (
                      <MarkdownMessage content={msg.content} />
                    ) : streaming && i === messages.length - 1 ? (
                      <span className="helpchat-typing">
                        <span /><span /><span />
                      </span>
                    ) : null
                  ) : (
                    msg.content
                  )}
                </div>
              </div>
            ))}
            {error && <p className="helpchat-error">{error}</p>}
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
