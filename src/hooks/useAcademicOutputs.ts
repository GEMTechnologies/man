import { useAtomValue } from "jotai";
import { useMemo } from "react";
import { chatMessagesAtom } from "@/atoms/chatAtoms";
import type { Message, PresentationSlide } from "@/ipc/ipc_types";

export type DocumentOutput = {
  title: string;
  format: "markdown" | "html";
  body: string;
  attributes: Record<string, string>;
};

export type Slide = PresentationSlide;

export type SlidesOutput = {
  title: string;
  slides: Slide[];
  attributes: Record<string, string>;
};

export type RawOutput = {
  format: string;
  content: string;
  attributes: Record<string, string>;
};

export interface AcademicOutputs {
  document?: DocumentOutput;
  slides?: SlidesOutput;
  raw?: RawOutput;
  sourceMessage?: Message;
}

const TAG_PATTERNS: Record<string, RegExp> = {
  document: /<man-document([^>]*)>([\s\S]*?)<\/man-document>/gi,
  slides: /<man-slides([^>]*)>([\s\S]*?)<\/man-slides>/gi,
  raw: /<man-raw-output([^>]*)>([\s\S]*?)<\/man-raw-output>/gi,
};

function decodeAttributeValue(value: string): string {
  return value.replace(/＜/g, "<").replace(/＞/g, ">");
}

function parseAttributes(attributeString: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const attributePattern = /(\w+)="([^"]*)"/g;
  let attributeMatch: RegExpExecArray | null;

  while ((attributeMatch = attributePattern.exec(attributeString)) !== null) {
    const [, key, rawValue] = attributeMatch;
    attributes[key] = decodeAttributeValue(rawValue);
  }

  return attributes;
}

function findLastTag(
  content: string,
  pattern: RegExp,
): { attributes: Record<string, string>; body: string } | undefined {
  let match: RegExpExecArray | null;
  let lastMatch: RegExpExecArray | null = null;

  pattern.lastIndex = 0;
  while ((match = pattern.exec(content)) !== null) {
    lastMatch = match;
  }

  if (!lastMatch) {
    return undefined;
  }

  const [, attributeString = "", body = ""] = lastMatch;
  return {
    attributes: parseAttributes(attributeString),
    body: body.trim(),
  };
}

function parseSlides(body: string): PresentationSlide[] {
  try {
    const parsed = JSON.parse(body);
    if (Array.isArray(parsed)) {
      return parsed.map((slide) => ({
        title: typeof slide.title === "string" ? slide.title : "Untitled Slide",
        bullets: Array.isArray(slide.bullets)
          ? slide.bullets.filter(
              (item: unknown): item is string => typeof item === "string",
            )
          : [],
        notes: typeof slide.notes === "string" ? slide.notes : undefined,
        visuals: Array.isArray(slide.visuals)
          ? slide.visuals.filter(
              (item: unknown): item is string => typeof item === "string",
            )
          : undefined,
      }));
    }

    if (parsed && Array.isArray(parsed.slides)) {
      return parseSlides(JSON.stringify(parsed.slides));
    }
  } catch (error) {
    console.warn("Failed to parse slides payload", error);
  }

  return [];
}

export function useAcademicOutputs(): AcademicOutputs {
  const messages = useAtomValue(chatMessagesAtom);

  return useMemo(() => {
    const latestAssistant = [...messages]
      .reverse()
      .find((message) => message.role === "assistant" && !!message.content);

    if (!latestAssistant || !latestAssistant.content) {
      return {};
    }

    const content = latestAssistant.content;

    const documentMatch = findLastTag(content, TAG_PATTERNS.document);
    const slidesMatch = findLastTag(content, TAG_PATTERNS.slides);
    const rawMatch = findLastTag(content, TAG_PATTERNS.raw);

    const document: DocumentOutput | undefined = documentMatch
      ? {
          title:
            documentMatch.attributes.title?.trim() || "Generated Research Paper",
          format:
            documentMatch.attributes.format === "html" ? "html" : "markdown",
          body: documentMatch.body,
          attributes: documentMatch.attributes,
        }
      : undefined;

    const slides = slidesMatch
      ? {
          title:
            slidesMatch.attributes.title?.trim() || "Generated Slide Deck",
          slides: parseSlides(slidesMatch.body),
          attributes: slidesMatch.attributes,
        }
      : undefined;

    const raw = rawMatch
      ? {
          format: rawMatch.attributes.format || "markdown",
          content: rawMatch.body,
          attributes: rawMatch.attributes,
        }
      : undefined;

    return {
      document,
      slides,
      raw,
      sourceMessage: latestAssistant,
    };
  }, [messages]);
}
