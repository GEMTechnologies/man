import { useState, useRef, useEffect, useCallback } from "react";
import { useAtom, useAtomValue } from "jotai";
import { chatMessagesAtom, chatStreamCountAtom } from "../atoms/chatAtoms";
import { IpcClient } from "@/ipc/ipc_client";

import { ChatHeader } from "./chat/ChatHeader";
import { MessagesList } from "./chat/MessagesList";
import { ChatInput } from "./chat/ChatInput";
import { ChatError } from "./chat/ChatError";

interface ChatPanelProps {
  chatId?: number;
  isPreviewOpen: boolean;
  onTogglePreview: () => void;
}

export function ChatPanel({
  chatId,
  isPreviewOpen,
  onTogglePreview,
}: ChatPanelProps) {
  const [messages, setMessages] = useAtom(chatMessagesAtom);
  const [error, setError] = useState<string | null>(null);
  const streamCount = useAtomValue(chatStreamCountAtom);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);

  const [isUserScrolling, setIsUserScrolling] = useState(false);
  const userScrollTimeoutRef = useRef<number | null>(null);
  const lastScrollTopRef = useRef<number>(0);

  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  const handleScroll = () => {
    if (!messagesContainerRef.current) return;

    const container = messagesContainerRef.current;
    const currentScrollTop = container.scrollTop;

    if (currentScrollTop < lastScrollTopRef.current) {
      setIsUserScrolling(true);

      if (userScrollTimeoutRef.current) {
        window.clearTimeout(userScrollTimeoutRef.current);
      }

      userScrollTimeoutRef.current = window.setTimeout(() => {
        setIsUserScrolling(false);
      }, 1000);
    }

    lastScrollTopRef.current = currentScrollTop;
  };

  useEffect(() => {
    scrollToBottom("instant");
  }, [streamCount]);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (container) {
      container.addEventListener("scroll", handleScroll, { passive: true });
    }

    return () => {
      if (container) {
        container.removeEventListener("scroll", handleScroll);
      }
      if (userScrollTimeoutRef.current) {
        window.clearTimeout(userScrollTimeoutRef.current);
      }
    };
  }, []);

  const fetchChatMessages = useCallback(async () => {
    if (!chatId) {
      setMessages([]);
      return;
    }
    const chat = await IpcClient.getInstance().getChat(chatId);
    setMessages(chat.messages);
  }, [chatId, setMessages]);

  useEffect(() => {
    fetchChatMessages();
  }, [fetchChatMessages]);

  useEffect(() => {
    if (
      !isUserScrolling &&
      messagesContainerRef.current &&
      messages.length > 0
    ) {
      const { scrollTop, clientHeight, scrollHeight } =
        messagesContainerRef.current;
      const threshold = 280;
      const isNearBottom =
        scrollHeight - (scrollTop + clientHeight) <= threshold;

      if (isNearBottom) {
        requestAnimationFrame(() => {
          scrollToBottom("instant");
        });
      }
    }
  }, [messages, isUserScrolling]);

  return (
    <div className="flex h-full flex-col">
      <ChatHeader
        isPreviewOpen={isPreviewOpen}
        onTogglePreview={onTogglePreview}
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        <MessagesList
          messages={messages}
          messagesEndRef={messagesEndRef}
          ref={messagesContainerRef}
        />
        <ChatError error={error} onDismiss={() => setError(null)} />
        <ChatInput chatId={chatId} />
      </div>
    </div>
  );
}
