"use client";

import Image from "next/image";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export function MarkdownRenderer({
  content,
  className = "",
}: MarkdownRendererProps) {
  return (
    <div className={`markdown-content ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          // Custom code block component
          code({ node, className, children, ...props }: any) {
            const match = /language-(\w+)/.exec(className || "");
            const language = match ? match[1] : "";
            const inline = !className || !className.startsWith("language-");

            if (!inline && language) {
              return (
                <div className="code-block-wrapper">
                  <div className="code-block-header">
                    <span className="code-language">{language}</span>
                  </div>
                  <pre className={`hljs language-${language}`}>
                    <code className={className} {...props}>
                      {children}
                    </code>
                  </pre>
                </div>
              );
            }

            return (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
          // Custom table component
          table({ children }) {
            return (
              <div className="md-table-wrap">
                <table className="md-table">{children}</table>
              </div>
            );
          },
          // Custom link component
          a({ href, children }) {
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="markdown-link"
              >
                {children}
              </a>
            );
          },
          // Custom image component
          img({ src, alt }) {
            return (
              <Image
                src={(src as string) || ""}
                alt={alt || ""}
                className="markdown-image"
                unoptimized
                width={0}
                height={0}
                sizes="100vw"
                style={{ width: "100%", height: "auto" }}
              />
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>

      <style jsx>{`
        .markdown-content {
          line-height: 1.5;
          width: 100%;
          max-width: 100%;
          min-width: 0;
          box-sizing: border-box;
          word-break: break-word;
          overflow-wrap: anywhere;
        }

        .markdown-content h1,
        .markdown-content h2,
        .markdown-content h3,
        .markdown-content h4,
        .markdown-content h5,
        .markdown-content h6 {
          margin: 0.5rem 0 0.25rem;
          font-weight: 600;
          color: inherit;
        }

        .markdown-content h1 {
          font-size: 1.25rem;
        }

        .markdown-content h2 {
          font-size: 1.15rem;
        }

        .markdown-content h3 {
          font-size: 1.1rem;
        }

        .markdown-content p {
          margin: 0.5rem 0;
        }

        .markdown-content ul,
        .markdown-content ol {
          margin: 0.5rem 0;
          padding-left: 1.5rem;
        }

        .markdown-content li {
          margin: 0.25rem 0;
        }

        .markdown-content blockquote {
          margin: 0.5rem 0;
          padding-left: 1rem;
          border-left: 3px solid var(--border);
          color: var(--muted);
          font-style: italic;
        }

        .code-block-wrapper {
          margin: 0.5rem 0;
          border-radius: 8px;
          overflow: hidden;
          border: 1px solid var(--border);
        }

        .code-block-wrapper,
        .code-block-wrapper pre,
        .code-block-wrapper pre code {
          width: 100%;
          max-width: 100%;
          box-sizing: border-box;
        }

        .code-block-header {
          background: var(--panel-2);
          padding: 0.5rem 1rem;
          border-bottom: 1px solid var(--border);
          font-size: 0.875rem;
          color: var(--muted);
        }

        .code-block-header .code-language {
          text-transform: uppercase;
          font-weight: 600;
          letter-spacing: 0.05em;
        }

        .markdown-content pre {
          margin: 0;
          padding: 1rem;
          overflow-x: auto;
          background: var(--panel);
          width: 100%;
          max-width: 100%;
          box-sizing: border-box;
          white-space: pre;
        }

        .markdown-content pre code {
          background: transparent;
          padding: 0;
          border-radius: 0;
          font-size: 13px;
          white-space: pre;
          word-break: break-word;
        }

        .markdown-content code:not(pre code) {
          background: rgba(255, 255, 255, 0.1);
          padding: 0.125rem 0.375rem;
          border-radius: 4px;
          font-size: 0.875rem;
        }

        .markdown-link {
          color: inherit;
          text-decoration: underline;
          text-underline-offset: 2px;
        }

        .markdown-link:hover {
          opacity: 0.8;
        }

        .markdown-image {
          max-width: 100%;
          height: auto;
          border-radius: 8px;
          margin: 0.5rem 0;
        }

        .markdown-content hr {
          border: none;
          border-top: 1px solid var(--border);
          margin: 1rem 0;
        }

        @media (max-width: 960px) {
          .markdown-content pre,
          .markdown-content pre code {
            white-space: pre-wrap;
            word-break: break-word;
          }
        }

        /* Light theme adjustments */
        :global(.light) .code-block-wrapper {
          border-color: #e0e0e0;
        }

        :global(.light) .code-block-header {
          background: #f8f9fa;
          border-bottom-color: #e0e0e0;
        }

        :global(.light) .markdown-content pre {
          background: #f8f9fa;
        }

        :global(.light) .markdown-content code:not(pre code) {
          background: rgba(0, 0, 0, 0.05);
        }
      `}</style>
    </div>
  );
}
