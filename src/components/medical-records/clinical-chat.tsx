"use client";

import { Loader2, Send, Trash2 } from "lucide-react";
import { Fragment, useEffect, useRef, useState } from "react";

import { askClinicalCopilot } from "@/app/(dashboard)/consultas/clinical-chat-actions";
import { Button } from "@/components/ui/button";
import type { RealtimeClinicalAnalysis } from "@/lib/ai/clinical-realtime-schema";
import type { ClinicalTimelineEvent } from "@/lib/ai/clinical-timeline-schema";

type ChatMessage = { role: "user" | "assistant"; content: string };

function MarkdownContent({ content }: { content: string }) {
  const lines = content.split("\n");
  return (
    <div className="space-y-2 text-sm leading-6">
      {lines.map((line, index) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={index} className="h-1" />;
        if (/^#{1,3}\s/.test(trimmed))
          return (
            <p key={index} className="font-semibold">
              {trimmed.replace(/^#{1,3}\s+/, "")}
            </p>
          );
        if (/^>\s?/.test(trimmed))
          return (
            <blockquote
              key={index}
              className="rounded-r border-l-4 border-amber-500 bg-amber-500/10 px-3 py-2"
            >
              {trimmed.replace(/^>\s?/, "")}
            </blockquote>
          );
        if (/^[-*]\s+\[[ xX]\]\s+/.test(trimmed)) {
          const checked = /^[-*]\s+\[[xX]\]/.test(trimmed);
          return (
            <label key={index} className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={checked}
                readOnly
                className="mt-1"
              />
              <span>{trimmed.replace(/^[-*]\s+\[[ xX]\]\s+/, "")}</span>
            </label>
          );
        }
        if (/^[-*]\s+/.test(trimmed))
          return (
            <p key={index} className="pl-3">
              • {trimmed.replace(/^[-*]\s+/, "")}
            </p>
          );
        if (/^\d+\.\s+/.test(trimmed))
          return (
            <p key={index} className="pl-3">
              {trimmed}
            </p>
          );
        if (/^\|.*\|$/.test(trimmed)) {
          if (/^\|?[\s|:-]+\|?$/.test(trimmed)) return null;
          const cells = trimmed
            .split("|")
            .slice(1, -1)
            .map((cell) => cell.trim());
          return (
            <div
              key={index}
              className="grid gap-2 border-b py-1"
              style={{
                gridTemplateColumns: `repeat(${cells.length}, minmax(0, 1fr))`,
              }}
            >
              {cells.map((cell, cellIndex) => (
                <span key={cellIndex}>{cell}</span>
              ))}
            </div>
          );
        }
        const parts = trimmed.split(/(\*\*[^*]+\*\*)/g);
        return (
          <p key={index}>
            {parts.map((part, partIndex) =>
              part.startsWith("**") && part.endsWith("**") ? (
                <strong key={partIndex}>{part.slice(2, -2)}</strong>
              ) : (
                <Fragment key={partIndex}>{part}</Fragment>
              ),
            )}
          </p>
        );
      })}
    </div>
  );
}

export function ClinicalChat({
  appointmentId,
  clinicalText,
  assistance,
  timelineEvents,
}: {
  appointmentId: string;
  clinicalText: string;
  assistance: RealtimeClinicalAnalysis;
  timelineEvents: ClinicalTimelineEvent[];
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!messages.length) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "Deseja apagar esta conversa?";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [messages.length]);

  useEffect(() => {
    const receiveQuestion = (event: Event) => {
      const questionEvent = event as CustomEvent<string>;
      if (questionEvent.detail) setQuestion(questionEvent.detail);
    };
    window.addEventListener("aster:chat-question", receiveQuestion);
    return () =>
      window.removeEventListener("aster:chat-question", receiveQuestion);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, loading]);

  async function send() {
    const value = question.trim();
    if (!value || loading) return;
    const history = messages.slice(-20);
    setMessages((current) => [...current, { role: "user", content: value }]);
    setQuestion("");
    setLoading(true);
    setError("");
    const result = await askClinicalCopilot({
      appointmentId,
      question: value,
      clinicalText,
      assistance,
      timelineEvents,
      history,
    });
    setLoading(false);
    if (result.error || !result.answer) {
      setError(result.error || "Não foi possível obter uma resposta.");
      return;
    }
    setMessages((current) => [
      ...current,
      { role: "assistant", content: result.answer },
    ]);
  }

  function clear() {
    if (messages.length && !window.confirm("Deseja apagar esta conversa?"))
      return;
    setMessages([]);
    setError("");
  }

  return (
    <div className="space-y-3">
      <div className="max-h-[55vh] space-y-3 overflow-y-auto pr-1">
        {!messages.length && (
          <p className="text-sm text-muted-foreground">
            {clinicalText.trim()
              ? "Faça uma pergunta sobre o contexto da consulta atual."
              : "Adicione contexto clínico para iniciar a conversa."}
          </p>
        )}
        {messages.map((message, index) => (
          <article
            key={`${message.role}-${index}`}
            className={
              message.role === "user"
                ? "ml-6 rounded-xl bg-primary px-3 py-2 text-sm text-primary-foreground"
                : "mr-2 rounded-xl border bg-muted/30 px-3 py-2"
            }
          >
            {message.role === "assistant" ? (
              <MarkdownContent content={message.content} />
            ) : (
              message.content
            )}
          </article>
        ))}
        {loading && (
          <p
            role="status"
            className="flex items-center gap-2 text-sm text-muted-foreground"
          >
            <Loader2 className="size-4 animate-spin" /> Copilot pensando...
          </p>
        )}
        <div ref={bottomRef} />
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <form
        className="space-y-2 border-t pt-3"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <textarea
          rows={3}
          maxLength={5000}
          value={question}
          disabled={loading}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void send();
            }
          }}
          placeholder="Pergunte sobre a consulta atual..."
          className="w-full resize-y rounded-lg border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        <div className="flex flex-wrap justify-between gap-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={loading || !messages.length}
            onClick={clear}
          >
            <Trash2 /> Limpar conversa
          </Button>
          <Button
            type="submit"
            size="sm"
            disabled={loading || question.trim().length < 2}
          >
            {loading ? <Loader2 className="animate-spin" /> : <Send />} Enviar
          </Button>
        </div>
      </form>
      <p className="text-xs text-muted-foreground">
        Respostas assistivas. Necessitam correlação clínica e não substituem o
        julgamento médico.
      </p>
    </div>
  );
}
