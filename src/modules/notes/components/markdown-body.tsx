import ReactMarkdown from "react-markdown";

// plan.md §3.3: Note.body supports markdown. A shared, minimal prose style
// rather than pulling in @tailwindcss/typography for one component.
export function MarkdownBody({ body }: { body: string }) {
  return (
    <div className="space-y-2 text-sm leading-relaxed break-words [&_a]:text-primary [&_a]:underline [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_h1]:text-xl [&_h1]:font-semibold [&_h2]:text-lg [&_h2]:font-semibold [&_li]:ml-4 [&_li]:list-disc [&_strong]:font-semibold">
      <ReactMarkdown>{body}</ReactMarkdown>
    </div>
  );
}
