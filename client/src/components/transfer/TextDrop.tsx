import React, { useState } from 'react';
import { Send, Copy, Check, MessageSquare } from 'lucide-react';
import { Button } from '../common/Button';
import { formatRelativeTime } from '../../utils/formatters';
import type { ReceivedText } from '../../types/transfer';

export interface TextDropProps {
  texts: ReceivedText[];
  onSendText: (content: string) => boolean;
  disabled?: boolean;
}

export const TextDrop: React.FC<TextDropProps> = ({ texts, onSendText, disabled = false }) => {
  const [content, setContent] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleSend = () => {
    if (!content.trim() || disabled) return;
    const ok = onSendText(content);
    if (ok) {
      setContent('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSend();
    }
  };

  const handleCopy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error('Failed to copy text:', err);
    }
  };

  return (
    <div className="w-full space-y-5">
      {/* Input Area */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 shadow-xs">
        <textarea
          rows={3}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={
            disabled
              ? 'Connect with a peer to drop text and links...'
              : 'Paste text, links, code, or notes (Ctrl+Enter to send)...'
          }
          className="w-full resize-none bg-transparent text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:outline-none disabled:opacity-50"
        />

        <div className="flex items-center justify-between pt-3 mt-1 border-t border-zinc-100 dark:border-zinc-800/80">
          <span className="hidden sm:inline-flex items-center gap-1 text-[11px] text-zinc-400">
            <span>Press</span>
            <kbd className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 font-mono text-[10px] text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700">
              Ctrl+Enter
            </kbd>
            <span>to drop</span>
          </span>

          <Button
            size="sm"
            variant="primary"
            onClick={handleSend}
            disabled={!content.trim() || disabled}
            rightIcon={<Send className="w-3.5 h-3.5" />}
            className="ml-auto"
          >
            Drop Text
          </Button>
        </div>
      </div>

      {/* Messages Feed */}
      <div className="space-y-3">
        {texts.length === 0 ? (
          <div className="text-center py-10 px-4 border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl bg-zinc-50/40 dark:bg-zinc-900/30">
            <div className="w-10 h-10 mx-auto mb-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-400">
              <MessageSquare className="w-5 h-5" />
            </div>
            <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
              No shared text yet
            </p>
            <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5">
              Send links, code snippets, or notes instantly to your paired device.
            </p>
          </div>
        ) : (
          texts.map((item) => {
            const isLocal = item.sender === 'local';
            const isCopied = copiedId === item.id;

            return (
              <div
                key={item.id}
                className="group relative bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 shadow-xs transition-all duration-150 hover:border-zinc-300 dark:hover:border-zinc-700"
              >
                <div className="flex items-center justify-between text-xs text-zinc-400 mb-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-block w-2 h-2 rounded-full ${
                        isLocal ? 'bg-zinc-400 dark:bg-zinc-600' : 'bg-emerald-500'
                      }`}
                    />
                    <span className="font-medium text-zinc-600 dark:text-zinc-400">
                      {isLocal ? 'You (Sent)' : 'Peer (Received)'}
                    </span>
                    <span>•</span>
                    <span className="text-[11px]">{formatRelativeTime(item.timestamp)}</span>
                  </div>

                  <button
                    onClick={() => handleCopy(item.id, item.content)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 transition-colors"
                    title="Copy text to clipboard"
                  >
                    {isCopied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-500" />
                        <span className="text-emerald-600 dark:text-emerald-400">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="text-sm text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap break-words font-sans selection:bg-zinc-900 selection:text-white dark:selection:bg-zinc-100 dark:selection:text-zinc-950">
                  {item.content}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
