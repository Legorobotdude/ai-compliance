"use client";

import { useMemo, useState } from "react";

import { SectionCard } from "@/components/ui/section-card";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: AiChatCitation[];
  contextResults?: RagResultChunk[];
};

type AiChatCitation = {
  chunkId: string;
  quote: string;
  sourceTitle?: string;
  sourceUrl?: string;
  relevance?: number;
};

type RagResultChunk = {
  id: string;
  documentTitle: string;
  sourceType: string;
  score: number;
  content: string;
  sourceUrl?: string;
};

type ApiChatResponse = {
  conversationId: string;
  messageId: string;
  reply: string;
  citations: AiChatCitation[];
  context: {
    contextId: string;
    results: RagResultChunk[];
  };
};

export function CoraChatPanel() {
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "I am CORA. Ask about regulations, supplier risk, or certification evidence and I will search the indexed documents before replying."
    }
  ]);
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!prompt.trim()) {
      return;
    }
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: prompt.trim()
    };
    const optimisticMessages = [...messages, userMessage];
    setMessages(optimisticMessages);
    setPrompt("");
    setError(null);
    setLoading(true);
    try {
      const payload = {
        conversationId,
        messages: optimisticMessages
          .filter((message) => message.role === "user" || message.role === "assistant")
          .map((message) => ({ role: message.role, content: message.content }))
      };
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({ error: "Chat failed" }));
        throw new Error((body && body.error) || "Chat failed");
      }
      const data = (await response.json()) as ApiChatResponse;
      setConversationId(data.conversationId);
      setMessages((prev) => [
        ...prev,
        {
          id: data.messageId,
          role: "assistant",
          content: data.reply,
          citations: data.citations,
          contextResults: data.context?.results ?? []
        }
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to reach CORA");
    } finally {
      setLoading(false);
    }
  }

  return (
    <SectionCard
      title="CORA RAG chat"
      description="Conversational search wired to the new Search/RAG module (Architecture.md §§1 & 4)."
    >
      <div className="space-y-4">
        <div className="flex flex-col gap-4 rounded-2xl border border-slate-800/80 bg-slate-950/40 p-4 text-sm">
          {messages.map((message) => (
            <ChatBubble key={message.id} message={message} />
          ))}
        </div>
        {error ? (
          <p className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{error}</p>
        ) : null}
        <form onSubmit={handleSubmit} className="flex flex-col gap-3 text-sm">
          <textarea
            className="min-h-[80px] w-full rounded-2xl border border-slate-800 bg-slate-950/80 px-4 py-3 text-base text-white shadow-inner focus:border-brand-400 focus:outline-none"
            placeholder="Ask CORA about PFAS, RoHS findings, or supplier risk…"
            value={prompt}
            onChange={(event) => setPrompt(event.currentTarget.value)}
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading}
            className="self-start rounded-xl bg-brand-500 px-5 py-2 text-sm font-semibold text-slate-950 transition hover:bg-brand-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Thinking…" : "Send"}
          </button>
        </form>
      </div>
    </SectionCard>
  );
}

function ChatBubble({ message }: { message: ChatMessage }) {
  const alignment = message.role === "user" ? "items-end" : "items-start";
  const bubbleClasses =
    message.role === "user"
      ? "bg-brand-500/20 border border-brand-400/40 text-brand-100"
      : "bg-slate-900/70 border border-slate-800 text-slate-100";
  const label = message.role === "user" ? "You" : "CORA";

  return (
    <div className={`flex flex-col ${alignment} gap-2`}>
      <span className="text-xs uppercase tracking-wide text-slate-400">{label}</span>
      <div className={`w-full rounded-2xl px-4 py-3 text-sm shadow-inner ${bubbleClasses}`}>
        <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
        {message.citations && message.citations.length > 0 ? <CitationList citations={message.citations} /> : null}
        {message.contextResults && message.contextResults.length > 0 ? (
          <ContextPreview results={message.contextResults} />
        ) : null}
      </div>
    </div>
  );
}

function CitationList({ citations }: { citations: AiChatCitation[] }) {
  return (
    <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-300">
      {citations.map((citation) => (
        <a
          key={citation.chunkId}
          href={citation.sourceUrl ?? "#"}
          target="_blank"
          rel="noreferrer"
          className="rounded-full border border-slate-700/80 px-3 py-1 hover:border-brand-400 hover:text-brand-200"
        >
          #{citation.chunkId.slice(0, 6)} · {citation.sourceTitle ?? "Context"}
        </a>
      ))}
    </div>
  );
}

function ContextPreview({ results }: { results: RagResultChunk[] }) {
  const topResults = useMemo(() => results.slice(0, 2), [results]);
  return (
    <div className="mt-3 space-y-2 rounded-xl border border-slate-800/70 bg-slate-900/60 p-3 text-xs text-slate-300">
      <p className="text-[0.7rem] uppercase tracking-wide text-slate-500">Retrieved evidence</p>
      {topResults.map((result) => (
        <div key={result.id}>
          <p className="font-semibold text-slate-200">
            {result.documentTitle} · {result.sourceType} · score {result.score.toFixed(2)}
          </p>
          <p className="line-clamp-3 text-slate-400">{result.content}</p>
        </div>
      ))}
    </div>
  );
}
