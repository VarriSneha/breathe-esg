import { useGetIngestion } from "@workspace/api-client-react";
import { getGetIngestionQueryKey } from "@workspace/api-client-react";
import { formatCo2e, formatDate, formatNumber } from "@/lib/formatters";
import { Link, useParams } from "wouter";
import { AlertCircle, AlertTriangle, ArrowLeft, CheckCircle2, ChevronRight, FileUp, Loader2 } from "lucide-react";
import { EmissionRecord, IngestionError } from "@workspace/api-client-react/src/generated/api.schemas";

export default function IngestionDetail() {
  const params = useParams<{ id: string }>();
  const id = parseInt(params.id || "0", 10);
  
  const { data: ingestion, isLoading } = useGetIngestion(id, {
    query: {
      enabled: !!id,
      queryKey: getGetIngestionQueryKey(id)
    }
  });

  if (isLoading) {
    return <div className="animate-pulse h-96 bg-muted rounded-md w-full"></div>;
  }

  if (!ingestion) return <div>Ingestion not found</div>;

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/ingestions" className="hover:text-primary transition-colors flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> Ingestions
        </Link>
        <ChevronRight className="w-3 h-3" />
        <span className="text-foreground font-medium">Run #{ingestion.id}</span>
      </div>

      <header className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-serif font-bold text-foreground flex items-center gap-3">
            {ingestion.fileName}
            <StatusBadge status={ingestion.status} />
          </h1>
          <div className="flex items-center gap-4 mt-3 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5"><FileUp className="w-4 h-4" /> {ingestion.sourceType} source</span>
            <span>•</span>
            <span>Client: <span className="font-medium text-foreground">{ingestion.clientName}</span></span>
            <span>•</span>
            <span>Uploaded: {formatDate(ingestion.createdAt)}</span>
          </div>
        </div>
      </header>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-4">
        <div className="border border-border bg-card p-4 rounded-md shadow-sm">
          <div className="text-sm font-medium text-muted-foreground mb-1">Total Rows Processed</div>
          <div className="text-2xl font-mono">{formatNumber(ingestion.totalRows)}</div>
        </div>
        <div className="border border-border bg-card p-4 rounded-md shadow-sm">
          <div className="text-sm font-medium text-muted-foreground mb-1">Successfully Parsed</div>
          <div className="text-2xl font-mono text-green-600 dark:text-green-400">{formatNumber(ingestion.successRows)}</div>
        </div>
        <div className="border border-border bg-card p-4 rounded-md shadow-sm">
          <div className="text-sm font-medium text-muted-foreground mb-1">Failed to Parse</div>
          <div className="text-2xl font-mono text-red-600 dark:text-red-400">{formatNumber(ingestion.failedRows)}</div>
        </div>
        <div className="border border-border bg-card p-4 rounded-md shadow-sm">
          <div className="text-sm font-medium text-muted-foreground mb-1 flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 text-orange-500" /> Suspicious Flags
          </div>
          <div className="text-2xl font-mono text-orange-600 dark:text-orange-400">{formatNumber(ingestion.suspiciousRows)}</div>
        </div>
      </div>

      {ingestion.errors && ingestion.errors.length > 0 && (
        <div className="border border-red-200 bg-red-50/50 dark:border-red-900/50 dark:bg-red-900/10 rounded-md overflow-hidden">
          <div className="bg-red-100/50 dark:bg-red-900/30 p-3 border-b border-red-200 dark:border-red-900/50 flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
            <h3 className="font-medium text-red-900 dark:text-red-300">Parse Errors ({ingestion.errors.length})</h3>
          </div>
          <div className="p-0 overflow-auto max-h-64">
            <table className="w-full text-sm text-left">
              <thead className="bg-red-50/50 dark:bg-red-900/20 text-red-800 dark:text-red-300">
                <tr>
                  <th className="p-3 font-medium w-24">Row</th>
                  <th className="p-3 font-medium">Error Message</th>
                  <th className="p-3 font-medium">Raw Data</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-red-100 dark:divide-red-900/30 text-red-900 dark:text-red-200">
                {ingestion.errors.map((err, i) => (
                  <tr key={i}>
                    <td className="p-3 font-mono text-xs">{err.rowNumber}</td>
                    <td className="p-3 font-medium">{err.errorMessage}</td>
                    <td className="p-3 font-mono text-xs truncate max-w-xs">{err.rawData}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-serif font-bold">Processed Records</h2>
          <Link href={`/review?ingestionId=${ingestion.id}`} className="text-sm bg-primary text-primary-foreground px-4 py-2 rounded-md font-medium hover:bg-primary/90 transition-colors">
            Open in Review Queue
          </Link>
        </div>
        <div className="border border-border bg-card rounded-md shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left whitespace-nowrap">
              <thead>
                <tr className="bg-muted/50 border-b border-border text-muted-foreground">
                  <th className="p-3 font-medium">Status</th>
                  <th className="p-3 font-medium">Source Ref</th>
                  <th className="p-3 font-medium">Category</th>
                  <th className="p-3 font-medium">Activity Date</th>
                  <th className="p-3 font-medium text-right">Raw Qty</th>
                  <th className="p-3 font-medium text-right">CO₂e</th>
                  <th className="p-3 font-medium">Flags</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {ingestion.records?.slice(0, 100).map((record) => (
                  <RecordRow key={record.id} record={record} />
                ))}
                {!ingestion.records?.length && (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-muted-foreground">No records parsed successfully.</td>
                  </tr>
                )}
              </tbody>
            </table>
            {ingestion.records && ingestion.records.length > 100 && (
              <div className="p-4 text-center border-t border-border text-sm text-muted-foreground">
                Showing first 100 records. Use the Review Queue to see all.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function RecordRow({ record }: { record: EmissionRecord }) {
  return (
    <tr className="hover:bg-muted/30 transition-colors">
      <td className="p-3">
        <RecordStatusBadge status={record.status} />
      </td>
      <td className="p-3 font-mono text-xs">
        <Link href={`/records/${record.id}`} className="text-primary hover:underline">{record.sourceRef}</Link>
      </td>
      <td className="p-3">{record.category}</td>
      <td className="p-3">{formatDate(record.activityDate).split(',')[0]}</td>
      <td className="p-3 text-right font-mono">{formatNumber(record.rawQuantity, 2)} <span className="text-muted-foreground text-xs">{record.rawUnit}</span></td>
      <td className="p-3 text-right font-mono font-medium">{formatCo2e(record.co2eKg)}</td>
      <td className="p-3">
        {record.suspiciousFlags && record.suspiciousFlags.length > 0 ? (
          <div className="flex gap-1 flex-wrap max-w-[200px]">
            {record.suspiciousFlags.map((flag, i) => (
              <span key={i} className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300 border border-orange-200 dark:border-orange-800/50">
                {flag.replace(/_/g, ' ')}
              </span>
            ))}
          </div>
        ) : (
          <span className="text-muted-foreground text-xs">-</span>
        )}
      </td>
    </tr>
  );
}

function RecordStatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-400 border-amber-200 dark:border-amber-800/50",
    approved: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-400 border-green-200 dark:border-green-800/50",
    flagged: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-400 border-orange-200 dark:border-orange-800/50",
    rejected: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-400 border-red-200 dark:border-red-800/50",
  };
  
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${colors[status] || "bg-gray-100 text-gray-800"}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'completed') {
    return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
      <CheckCircle2 className="w-3.5 h-3.5" /> Completed
    </span>;
  }
  if (status === 'failed') {
    return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
      <AlertCircle className="w-3.5 h-3.5" /> Failed
    </span>;
  }
  return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Processing
  </span>;
}
