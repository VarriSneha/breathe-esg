import { useGetRecord, getGetRecordQueryKey, useApproveRecord, useFlagRecord, useRejectRecord } from "@workspace/api-client-react";
import { formatCo2e, formatDate, formatNumber } from "@/lib/formatters";
import { Link, useParams } from "wouter";
import { ArrowLeft, Check, AlertTriangle, X, ChevronRight, FileText, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

export default function RecordDetail() {
  const params = useParams<{ id: string }>();
  const id = parseInt(params.id || "0", 10);
  
  const { data: record, isLoading } = useGetRecord(id, {
    query: {
      enabled: !!id,
      queryKey: getGetRecordQueryKey(id)
    }
  });

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [note, setNote] = useState("");
  
  const approve = useApproveRecord();
  const flag = useFlagRecord();
  const reject = useRejectRecord();

  const handleAction = (action: any, actionName: string) => {
    action.mutate({
      id,
      data: { note, reviewedBy: "Current User" }
    }, {
      onSuccess: () => {
        toast({ title: `Record ${actionName}` });
        setNote("");
        queryClient.invalidateQueries({ queryKey: getGetRecordQueryKey(id) });
      }
    });
  };

  if (isLoading) {
    return <div className="animate-pulse h-96 bg-muted rounded-md w-full"></div>;
  }

  if (!record) return <div>Record not found</div>;

  const isLocked = record.status === 'approved';

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/review" className="hover:text-primary transition-colors flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> Review Queue
        </Link>
        <ChevronRight className="w-3 h-3" />
        <span className="text-foreground font-medium">{record.sourceRef}</span>
      </div>

      <header className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-serif font-bold text-foreground">Record: {record.sourceRef}</h1>
          <p className="text-muted-foreground mt-1 text-sm">{record.clientName} • Ingestion #{record.ingestionId}</p>
        </div>
        <StatusBadge status={record.status} />
      </header>

      <div className="grid grid-cols-3 gap-6">
        {/* Main Details */}
        <div className="col-span-2 space-y-6">
          <div className="border border-border bg-card rounded-md shadow-sm overflow-hidden">
            <div className="bg-muted/30 p-4 border-b border-border flex items-center gap-2 font-medium">
              <FileText className="w-4 h-4 text-muted-foreground" />
              Activity Details
            </div>
            <div className="p-0">
              <table className="w-full text-sm">
                <tbody className="divide-y divide-border">
                  <tr>
                    <td className="py-3 px-4 font-medium text-muted-foreground w-1/3 bg-muted/5">Category</td>
                    <td className="py-3 px-4 font-medium">{record.category}</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-4 font-medium text-muted-foreground bg-muted/5">Scope</td>
                    <td className="py-3 px-4 uppercase tracking-wider text-xs font-bold">{record.scope}</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-4 font-medium text-muted-foreground bg-muted/5">Source Type</td>
                    <td className="py-3 px-4 capitalize">{record.sourceType}</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-4 font-medium text-muted-foreground bg-muted/5">Activity Date</td>
                    <td className="py-3 px-4">{formatDate(record.activityDate)}</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-4 font-medium text-muted-foreground bg-muted/5">Description</td>
                    <td className="py-3 px-4">{record.activityDescription}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="border border-border bg-card rounded-md shadow-sm overflow-hidden">
            <div className="bg-muted/30 p-4 border-b border-border flex items-center gap-2 font-medium">
              <Activity className="w-4 h-4 text-muted-foreground" />
              Calculation Trace
            </div>
            <div className="p-6">
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1 text-center p-4 bg-muted/20 rounded border border-border/50">
                  <div className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Raw Activity Data</div>
                  <div className="text-2xl font-mono">{formatNumber(record.rawQuantity, 2)} <span className="text-sm text-muted-foreground">{record.rawUnit}</span></div>
                  {record.normalizedQuantityKwh && (
                    <div className="text-xs text-muted-foreground mt-2 border-t border-border pt-2">
                      Normalized: {formatNumber(record.normalizedQuantityKwh, 2)} kWh
                    </div>
                  )}
                </div>
                
                <div className="text-muted-foreground font-mono font-light text-xl">×</div>
                
                <div className="flex-1 text-center p-4 bg-muted/20 rounded border border-border/50">
                  <div className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Emission Factor</div>
                  <div className="text-xl font-mono">{formatNumber(record.emissionFactor, 4)}</div>
                  <div className="text-xs text-primary mt-2 border-t border-border pt-2 truncate px-2" title={record.emissionFactorSource}>
                    {record.emissionFactorSource}
                  </div>
                </div>

                <div className="text-muted-foreground font-mono font-light text-xl">=</div>

                <div className="flex-1 text-center p-4 bg-primary/5 rounded border border-primary/20">
                  <div className="text-xs text-primary uppercase tracking-wider mb-2 font-bold">Total Emissions</div>
                  <div className="text-2xl font-mono font-bold text-primary">{formatNumber(record.co2eKg, 2)}</div>
                  <div className="text-xs text-primary/70 mt-2 border-t border-primary/10 pt-2">
                    kg CO₂e
                  </div>
                </div>
              </div>
            </div>
          </div>

          {record.suspiciousFlags && record.suspiciousFlags.length > 0 && (
            <div className="border border-orange-200 bg-orange-50/50 dark:border-orange-900/50 dark:bg-orange-900/10 rounded-md p-4">
              <h3 className="text-orange-800 dark:text-orange-400 font-medium flex items-center gap-2 mb-3">
                <AlertTriangle className="w-4 h-4" /> System Flags
              </h3>
              <ul className="list-disc list-inside pl-5 text-sm text-orange-900/80 dark:text-orange-200/80 space-y-1">
                {record.suspiciousFlags.map((flag, i) => (
                  <li key={i}>{flag.replace(/_/g, ' ')}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Sidebar Actions & Audit */}
        <div className="col-span-1 space-y-6">
          <div className="border border-border bg-card rounded-md shadow-sm p-4 sticky top-6">
            <h3 className="font-serif font-bold text-lg mb-4">Review Decision</h3>
            
            {isLocked ? (
              <div className="bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300 p-3 rounded text-sm mb-4 border border-green-200 dark:border-green-800/50 flex items-start gap-2">
                <Check className="w-4 h-4 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium">Approved & Locked</p>
                  <p className="opacity-80 text-xs mt-1">By {record.reviewedBy} on {formatDate(record.reviewedAt!)}</p>
                </div>
              </div>
            ) : (
              <div className="space-y-3 mb-4">
                <textarea 
                  className="w-full text-sm border border-input rounded-md p-2 min-h-[80px] bg-background resize-none focus:ring-1 focus:ring-primary outline-none"
                  placeholder="Add a review note (optional)..."
                  value={note}
                  onChange={e => setNote(e.target.value)}
                />
                <div className="grid grid-cols-2 gap-2">
                  <Button 
                    className="w-full bg-green-600 hover:bg-green-700 text-white gap-2"
                    onClick={() => handleAction(approve, "approved")}
                    disabled={approve.isPending}
                  >
                    <Check className="w-4 h-4" /> Approve
                  </Button>
                  <Button 
                    variant="outline" 
                    className="w-full text-orange-600 hover:text-orange-700 hover:bg-orange-50 border-orange-200 gap-2"
                    onClick={() => handleAction(flag, "flagged")}
                    disabled={flag.isPending}
                  >
                    <AlertTriangle className="w-4 h-4" /> Flag
                  </Button>
                </div>
                <Button 
                  variant="outline" 
                  className="w-full text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200 gap-2"
                  onClick={() => handleAction(reject, "rejected")}
                  disabled={reject.isPending}
                >
                  <X className="w-4 h-4" /> Reject Data
                </Button>
              </div>
            )}

            <hr className="border-border my-6" />

            <h3 className="font-medium text-sm mb-4 text-muted-foreground uppercase tracking-wider">Audit Trail</h3>
            <div className="space-y-4">
              {record.auditTrail?.map((audit, i) => (
                <div key={audit.id} className="relative pl-4">
                  {i !== record.auditTrail.length - 1 && (
                    <div className="absolute left-[7px] top-4 bottom-[-16px] w-px bg-border"></div>
                  )}
                  <div className="absolute left-0 top-1.5 w-3.5 h-3.5 rounded-full border-2 border-card bg-muted-foreground"></div>
                  
                  <div className="text-xs">
                    <p className="text-foreground font-medium">
                      {audit.action.replace(/_/g, ' ')}
                    </p>
                    <p className="text-muted-foreground mt-0.5">{formatDate(audit.createdAt)}</p>
                    <p className="text-muted-foreground mt-0.5">by {audit.actor || 'System'}</p>
                    {audit.note && <p className="text-muted-foreground italic mt-1 bg-muted/30 p-1.5 rounded border border-border/50">"{audit.note}"</p>}
                  </div>
                </div>
              ))}
              {!record.auditTrail?.length && (
                <p className="text-xs text-muted-foreground italic">No audit history available.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-400 border-amber-200 dark:border-amber-800/50",
    approved: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-400 border-green-200 dark:border-green-800/50",
    flagged: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-400 border-orange-200 dark:border-orange-800/50",
    rejected: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-400 border-red-200 dark:border-red-800/50",
  };
  
  return (
    <span className={`inline-flex items-center px-3 py-1 rounded-md text-sm font-bold uppercase tracking-wider border ${colors[status] || "bg-gray-100 text-gray-800"}`}>
      {status}
    </span>
  );
}
