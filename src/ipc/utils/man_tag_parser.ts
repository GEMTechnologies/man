import { normalizePath } from "../../../shared/normalizePath";
import log from "electron-log";
import { SqlQuery } from "../../lib/schemas";

const logger = log.scope("man_tag_parser");

export function getManWriteTags(fullResponse: string): {
  path: string;
  content: string;
  description?: string;
}[] {
  const manWriteRegex = /<man-write([^>]*)>([\s\S]*?)<\/man-write>/gi;
  const pathRegex = /path="([^"]+)"/;
  const descriptionRegex = /description="([^"]+)"/;

  let match;
  const tags: { path: string; content: string; description?: string }[] = [];

  while ((match = manWriteRegex.exec(fullResponse)) !== null) {
    const attributesString = match[1];
    let content = match[2].trim();

    const pathMatch = pathRegex.exec(attributesString);
    const descriptionMatch = descriptionRegex.exec(attributesString);

    if (pathMatch && pathMatch[1]) {
      const path = pathMatch[1];
      const description = descriptionMatch?.[1];

      const contentLines = content.split("\n");
      if (contentLines[0]?.startsWith("```")) {
        contentLines.shift();
      }
      if (contentLines[contentLines.length - 1]?.startsWith("```")) {
        contentLines.pop();
      }
      content = contentLines.join("\n");

      tags.push({ path: normalizePath(path), content, description });
    } else {
      logger.warn(
        "Found <man-write> tag without a valid 'path' attribute:",
        match[0],
      );
    }
  }
  return tags;
}

export function getManRenameTags(fullResponse: string): {
  from: string;
  to: string;
}[] {
  const manRenameRegex =
    /<man-rename from="([^"]+)" to="([^"]+)"[^>]*>([\s\S]*?)<\/man-rename>/g;
  let match;
  const tags: { from: string; to: string }[] = [];
  while ((match = manRenameRegex.exec(fullResponse)) !== null) {
    tags.push({
      from: normalizePath(match[1]),
      to: normalizePath(match[2]),
    });
  }
  return tags;
}

export function getManDeleteTags(fullResponse: string): string[] {
  const manDeleteRegex =
    /<man-delete path="([^"]+)"[^>]*>([\s\S]*?)<\/man-delete>/g;
  let match;
  const paths: string[] = [];
  while ((match = manDeleteRegex.exec(fullResponse)) !== null) {
    paths.push(normalizePath(match[1]));
  }
  return paths;
}

export function getManAddDependencyTags(fullResponse: string): string[] {
  const manAddDependencyRegex =
    /<man-add-dependency packages="([^"]+)">[^<]*<\/man-add-dependency>/g;
  let match;
  const packages: string[] = [];
  while ((match = manAddDependencyRegex.exec(fullResponse)) !== null) {
    packages.push(...match[1].split(" "));
  }
  return packages;
}

export function getManChatSummaryTag(fullResponse: string): string | null {
  const manChatSummaryRegex =
    /<man-chat-summary>([\s\S]*?)<\/man-chat-summary>/g;
  const match = manChatSummaryRegex.exec(fullResponse);
  if (match && match[1]) {
    return match[1].trim();
  }
  return null;
}

export function getManExecuteSqlTags(fullResponse: string): SqlQuery[] {
  const manExecuteSqlRegex =
    /<man-execute-sql([^>]*)>([\s\S]*?)<\/man-execute-sql>/g;
  const descriptionRegex = /description="([^"]+)"/;
  let match;
  const queries: { content: string; description?: string }[] = [];

  while ((match = manExecuteSqlRegex.exec(fullResponse)) !== null) {
    const attributesString = match[1] || "";
    let content = match[2].trim();
    const descriptionMatch = descriptionRegex.exec(attributesString);
    const description = descriptionMatch?.[1];

    // Handle markdown code blocks if present
    const contentLines = content.split("\n");
    if (contentLines[0]?.startsWith("```")) {
      contentLines.shift();
    }
    if (contentLines[contentLines.length - 1]?.startsWith("```")) {
      contentLines.pop();
    }
    content = contentLines.join("\n");

    queries.push({ content, description });
  }

  return queries;
}

export function getManCommandTags(fullResponse: string): string[] {
  const manCommandRegex =
    /<man-command type="([^"]+)"[^>]*><\/man-command>/g;
  let match;
  const commands: string[] = [];

  while ((match = manCommandRegex.exec(fullResponse)) !== null) {
    commands.push(match[1]);
  }

  return commands;
}
