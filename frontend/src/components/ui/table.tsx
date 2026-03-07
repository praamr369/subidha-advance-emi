import type { ReactNode } from "react";

type TableProps = {
  head: ReactNode;
  body: ReactNode;
};

export default function Table({ head, body }: TableProps) {
  return (
    <table className="min-w-full border-collapse rounded border bg-white">
      <thead>{head}</thead>
      <tbody>{body}</tbody>
    </table>
  );
}
