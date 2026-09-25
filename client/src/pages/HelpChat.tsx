import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowUp, Bot, ChevronDown } from "lucide-react";
import { API_BASE } from "../api/http";
import { getAuthToken } from "../api/authToken";
import { isNative } from "../lib/platform";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const HELP_SECTIONS = [
  {
    label: "Creating Plans",
    items: [
      {
        q: "What's the difference between a plan and an idea?",
        a: "A **plan** has a set date and location — it's ready for people to join. An **idea** is flexible; you haven't locked in the details yet but want to float it to your network. Ideas can be upgraded to full plans once things firm up.",
      },
      {
        q: "How do I post a plan?",
        a: "Tap the **+** button at the bottom of your feed, fill in the title, date, location, and description, then hit Post. Your plan goes live to your neighborhood feed immediately.",
      },
      {
        q: "How do I invite people to my plan?",
        a: "Open your plan and tap the share icon at the top. You can copy a direct link or share via iMessage to invite specific people.",
      },
      {
        q: "How do I cancel or edit a plan?",
        a: "Open your plan, tap the **⋯** menu at the top right, and choose Edit or Cancel. Cancelling sends a notification to everyone who RSVPed.",
      },
    ],
  },
  {
    label: "Joining & RSVPs",
    items: [
      {
        q: "How do I join a plan?",
        a: "Tap any plan in your feed to open it, then tap **I'm In**. You'll be added to the group chat and notified of any updates.",
      },
      {
        q: "What's the difference between I'm In and Interested?",
        a: "**I'm In** means you're committed — you show up in the going count and get all notifications. **Interested** lets you follow the plan and stay in the loop without fully committing.",
      },
      {
        q: "How do I leave a plan I joined?",
        a: "Open the plan, tap the **⋯** menu, then choose Leave. You'll be removed from the guest list and the group chat.",
      },
    ],
  },
  {
    label: "Communities",
    items: [
      {
        q: "How do I join a community?",
        a: "Tap **Communities** in the bottom nav, browse by category, and open any community. Hit **Join** to become a member and get access to the community feed and chat.",
      },
      {
        q: "How do I create a community?",
        a: "From the Communities tab, tap **New Community**. Add a name, cover photo, description, and category — then invite your first members.",
      },
      {
        q: "How does community chat work?",
        a: "Each community has a shared chat where all members can post. Tap the chat tab inside any community to see it — it works just like a group message.",
      },
    ],
  },
  {
    label: "Network",
    items: [
      {
        q: "How do I add someone to my network?",
        a: "Open anyone's profile and tap **Add to Network**. They'll get a notification and can accept. Once connected, you can message each other directly.",
      },
      {
        q: "How do invite codes work?",
        a: "Every member gets personal invite codes. Share one with a friend — when they sign up using it, you're automatically connected. Find yours under **Profile → Invite Friends**.",
      },
      {
        q: "What are mutual connections?",
        a: "Mutuals are people you both know on COMMONS. When you view someone's profile, shared connections show under their name so you know how you're linked.",
      },
    ],
  },
  {
    label: "Your Profile",
    items: [
      {
        q: "How do I edit my profile?",
        a: "Go to your **Profile** tab and tap **Edit** next to your name. You can update your photo, bio, name, and social links from there.",
      },
      {
        q: "How do I update my location?",
        a: "Go to **Settings → Location** and tap Share my location. COMMONS uses your GPS to show nearby plans first — your neighborhood also shows on your profile.",
      },
      {
        q: "How do I change my interests?",
        a: "Go to **Settings → Interests** and toggle any interest on or off. Your feed and community suggestions update automatically.",
      },
    ],
  },
  {
    label: "Feed & Discovery",
    items: [
      {
        q: "Why is my feed empty?",
        a: "A few reasons: you might be new to the area, or not many plans are posted near you yet. Try adjusting the neighborhood filter at the top, or check back soon — COMMONS is growing fast in Philadelphia.",
      },
      {
        q: "How does the feed ranking work?",
        a: "Plans are ranked by date first. If you've shared your location, plans within 15 miles of you are boosted higher so the most reachable things surface first.",
      },
      {
        q: "How do I filter the feed?",
        a: "Tap the filter icon at the top of the feed to filter by interest, neighborhood, or date. Toggle **Near You** to see only plans within 15 miles.",
      },
    ],
  },
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
  const navigate = useNavigate();
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

  const sendCanned = (question: string, answer: string) => {
    if (streaming) return;
    setOpenSection(null);
    setMessages((prev) => [
      ...prev,
      { role: "user", content: question },
      { role: "assistant", content: "" },
    ]);
    setTimeout(() => {
      setMessages((prev) => {
        const copy = [...prev];
        const last = copy[copy.length - 1];
        if (last?.role === "assistant") copy[copy.length - 1] = { ...last, content: answer };
        return copy;
      });
    }, 700);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send(input);
    }
  };

  const [openSection, setOpenSection] = useState<string | null>(null);
  const isEmpty = messages.length === 0;

  return (
    <main className="helpchat-shell">
      <header className="helpchat-header">
        <button type="button" className="back-circle" aria-label="Back" onClick={() => navigate(-1)}>
          <ArrowLeft size={18} strokeWidth={2} aria-hidden="true" />
        </button>
        <div className="helpchat-header-title">
          <Bot size={16} strokeWidth={1.8} aria-hidden="true" />
          Help &amp; Support
        </div>
        <div className="helpchat-header-spacer" />
      </header>

      <div className="helpchat-body">
        {isEmpty ? (
          <div className="helpchat-menu">
            <p className="helpchat-menu-hint">Select a topic or ask anything below</p>
            {HELP_SECTIONS.map((section) => {
              const isOpen = openSection === section.label;
              return (
                <div key={section.label} className="helpchat-section">
                  <button
                    type="button"
                    className={`helpchat-section-header${isOpen ? " is-open" : ""}`}
                    onClick={() => setOpenSection(isOpen ? null : section.label)}
                    aria-expanded={isOpen}
                  >
                    <span>{section.label}</span>
                    <ChevronDown size={16} strokeWidth={2} className="helpchat-section-chevron" aria-hidden="true" />
                  </button>
                  {isOpen && (
                    <div className="helpchat-section-items">
                      {section.items.map((item) => (
                        <button
                          key={item.q}
                          type="button"
                          className="helpchat-section-item"
                          onClick={() => sendCanned(item.q, item.a)}
                        >
                          {item.q}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
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
        <div className="helpchat-composer-box">
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
            <ArrowUp size={15} strokeWidth={2.5} aria-hidden="true" />
          </button>
        </div>
      </div>
    </main>
  );
}
