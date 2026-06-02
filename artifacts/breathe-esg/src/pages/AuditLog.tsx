import { useListAuditLog } from "@workspace/api-client-react";
import { formatDate } from "@/lib/formatters";
import { Activity, User, Tag, FileText, Database } from "lucide-react";
import { Link } from "wouter";

export default function AuditLog() {
  const { data: logs, isLoading } = useListAuditLog({ pageSize: 200 });

  if (isLoading) {
    return <div className="animate-pulse h-96 bg-muted rounded-md w-full"></div>;
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <header>
        <h1 className="text-3xl font-serif font-bold text-foreground">Global Audit Log</h1>
        <p className="text-muted-foreground mt-2 text-sm">Chronological record of all system events and analyst actions.</p>
      </header>

      <div className="border border-border bg-card rounded-md shadow-sm overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="bg-muted/50 border-b border-border text-muted-foreground">
            <tr>
              <th className="p-3 font-medium w-48">Timestamp</th>
              <th className="p-3 font-medium">Actor</th>
              <th className="p-3 font-medium">Action</th>
              <th className="p-3 font-medium">Context</th>
              <th className="p-3 font-medium">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {logs?.map((entry) => (
              <tr key={entry.id} className="hover:bg-muted/30 transition-colors">
                <td className="p-3 text-muted-foreground whitespace-nowrap">{formatDate(entry.createdAt)}</td>
                <td className="p-3 font-medium flex items-center gap-2">
                  {entry.actor ? <User className="w-3.5 h-3.5 text-muted-foreground" /> : <Database className="w-3.5 h-3.5 text-muted-foreground" />}
                  {entry.actor || "System"}
                </td>
                <td className="p-3">
                  <span className="inline-flex px-2 py-0.5 rounded text-[10px] uppercase font-bold bg-muted text-muted-foreground border border-border">
                    {entry.action.replace(/_/g, ' ')}
                  </span>
                </td>
                <td className="p-3 font-mono text-xs">
                  {entry.recordId ? (
                    <Link href={`/records/${entry.recordId}`} className="text-primary hover:underline flex items-center gap-1">
                      <Tag className="w-3 h-3" /> Record #{entry.recordId}
                    </Link>
                  ) : entry.ingestionId ? (
                    <Link href={`/ingestions/${entry.ingestionId}`} className="text-primary hover:underline flex items-center gap-1">
                      <FileText className="w-3 h-3" /> Ingestion #{entry.ingestionId}
                    </Link>
                  ) : "-"}
                </td>
                <td className="p-3 text-muted-foreground text-xs">
                  {entry.note ? `"${entry.note}"` : "-"}
                  {entry.previousValue && entry.newValue && (
                    <div className="mt-1">
                      <span className="line-through opacity-60">{entry.previousValue}</span> &rarr; <span className="text-foreground">{entry.newValue}</span>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {!logs?.length && (
              <tr>
                <td colSpan={5} className="p-8 text-center text-muted-foreground">No audit entries found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
