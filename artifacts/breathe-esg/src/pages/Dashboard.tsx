import { useGetDashboardSummary, useGetScopeBreakdown, useGetSourceBreakdown, useGetRecentActivity } from "@workspace/api-client-react";
import { formatCo2e, formatNumber, formatRelativeTime } from "@/lib/formatters";
import { Activity, AlertTriangle, CheckCircle, Clock, FileSpreadsheet, HardDrive, Target } from "lucide-react";
import { Link } from "wouter";

export default function Dashboard() {
  const { data: summary, isLoading: loadingSummary } = useGetDashboardSummary();
  const { data: scopeBreakdown, isLoading: loadingScope } = useGetScopeBreakdown();
  const { data: sourceBreakdown, isLoading: loadingSource } = useGetSourceBreakdown();
  const { data: recentActivity, isLoading: loadingActivity } = useGetRecentActivity();

  if (loadingSummary || loadingScope || loadingSource || loadingActivity) {
    return <div className="animate-pulse space-y-8">
      <div className="h-32 bg-muted rounded-md w-full"></div>
      <div className="grid grid-cols-2 gap-8">
        <div className="h-64 bg-muted rounded-md w-full"></div>
        <div className="h-64 bg-muted rounded-md w-full"></div>
      </div>
    </div>;
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-serif font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground mt-2 text-sm">Overview of ingestion activity and review status.</p>
      </header>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="border border-border bg-card p-5 rounded-md shadow-sm">
          <div className="flex items-center text-muted-foreground mb-3 text-sm font-medium">
            <CheckCircle className="w-4 h-4 mr-2 text-primary" />
            Approved Emissions
          </div>
          <div className="text-3xl font-mono font-medium">{summary ? formatCo2e(summary.approvedCo2eKg) : "-"}</div>
          <div className="text-xs text-muted-foreground mt-2 border-t border-border pt-2">
            Of {summary ? formatCo2e(summary.totalCo2eKg) : "-"} total tracked
          </div>
        </div>

        <div className="border border-border bg-card p-5 rounded-md shadow-sm">
          <div className="flex items-center text-muted-foreground mb-3 text-sm font-medium">
            <Clock className="w-4 h-4 mr-2 text-amber-500" />
            Pending Review
          </div>
          <div className="text-3xl font-mono font-medium">{summary ? formatNumber(summary.pendingRecords) : "-"}</div>
          <div className="text-xs text-muted-foreground mt-2 border-t border-border pt-2 flex items-center justify-between">
            <span>Records awaiting sign-off</span>
            <Link href="/review" className="text-primary hover:underline font-medium">Review &rarr;</Link>
          </div>
        </div>

        <div className="border border-border bg-card p-5 rounded-md shadow-sm">
          <div className="flex items-center text-muted-foreground mb-3 text-sm font-medium">
            <AlertTriangle className="w-4 h-4 mr-2 text-orange-500" />
            Flagged Anomalies
          </div>
          <div className="text-3xl font-mono font-medium text-orange-600 dark:text-orange-400">{summary ? formatNumber(summary.flaggedRecords) : "-"}</div>
          <div className="text-xs text-muted-foreground mt-2 border-t border-border pt-2 flex items-center justify-between">
            <span>Requires investigation</span>
            <Link href="/review?status=flagged" className="text-primary hover:underline font-medium">Investigate &rarr;</Link>
          </div>
        </div>

        <div className="border border-border bg-card p-5 rounded-md shadow-sm">
          <div className="flex items-center text-muted-foreground mb-3 text-sm font-medium">
            <HardDrive className="w-4 h-4 mr-2 text-blue-500" />
            Recent Ingestions
          </div>
          <div className="text-3xl font-mono font-medium">{summary ? formatNumber(summary.recentIngestions) : "-"}</div>
          <div className="text-xs text-muted-foreground mt-2 border-t border-border pt-2 flex items-center justify-between">
            <span>Upload runs in last 7 days</span>
            <Link href="/ingestions" className="text-primary hover:underline font-medium">View All &rarr;</Link>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Scope Breakdown */}
        <div className="col-span-1 border border-border bg-card rounded-md shadow-sm flex flex-col">
          <div className="p-5 border-b border-border">
            <h2 className="text-lg font-serif font-bold flex items-center gap-2">
              <Target className="w-5 h-5 text-muted-foreground" />
              Emissions by Scope
            </h2>
          </div>
          <div className="p-5 flex-1 space-y-6">
            {scopeBreakdown?.map((scope) => {
              const colors: Record<string, string> = {
                scope1: "bg-orange-500 dark:bg-orange-600",
                scope2: "bg-blue-500 dark:bg-blue-600",
                scope3: "bg-teal-500 dark:bg-teal-600"
              };
              const bg = colors[scope.scope] || "bg-gray-500";
              const total = scope.pendingCount + scope.approvedCount;
              const percentApproved = total > 0 ? (scope.approvedCount / total) * 100 : 0;
              
              return (
                <div key={scope.scope} className="space-y-2">
                  <div className="flex justify-between items-baseline">
                    <span className="font-medium text-sm capitalize">{scope.scope.replace('scope', 'Scope ')}</span>
                    <span className="font-mono text-sm">{formatCo2e(scope.co2eKg)}</span>
                  </div>
                  <div className="h-2 w-full bg-muted rounded-full overflow-hidden flex">
                    <div className={`h-full ${bg}`} style={{ width: `${percentApproved}%` }}></div>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{formatNumber(scope.approvedCount)} approved</span>
                    <span>{formatNumber(scope.pendingCount)} pending</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Source Breakdown */}
        <div className="col-span-1 border border-border bg-card rounded-md shadow-sm flex flex-col">
          <div className="p-5 border-b border-border">
            <h2 className="text-lg font-serif font-bold flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-muted-foreground" />
              Ingestion Sources
            </h2>
          </div>
          <div className="p-0 flex-1">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left font-medium p-3">Source Type</th>
                  <th className="text-right font-medium p-3">Records</th>
                  <th className="text-right font-medium p-3">Emissions</th>
                </tr>
              </thead>
              <tbody>
                {sourceBreakdown?.map((source) => (
                  <tr key={source.sourceType} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="p-3 font-medium capitalize flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${
                        source.sourceType === 'sap' ? 'bg-indigo-500' :
                        source.sourceType === 'utility' ? 'bg-amber-500' : 'bg-emerald-500'
                      }`} />
                      {source.sourceType}
                    </td>
                    <td className="p-3 text-right font-mono text-muted-foreground">{formatNumber(source.recordCount)}</td>
                    <td className="p-3 text-right font-mono">{formatCo2e(source.co2eKg)}</td>
                  </tr>
                ))}
                {!sourceBreakdown?.length && (
                  <tr>
                    <td colSpan={3} className="p-4 text-center text-muted-foreground italic">No sources found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="col-span-1 border border-border bg-card rounded-md shadow-sm flex flex-col">
          <div className="p-5 border-b border-border flex justify-between items-center">
            <h2 className="text-lg font-serif font-bold flex items-center gap-2">
              <Activity className="w-5 h-5 text-muted-foreground" />
              Recent Activity
            </h2>
            <Link href="/audit-log" className="text-xs text-primary hover:underline">View All</Link>
          </div>
          <div className="p-5 flex-1 overflow-y-auto max-h-[400px]">
            <div className="space-y-6">
              {recentActivity?.map((activity, i) => (
                <div key={activity.id} className="relative pl-6">
                  {/* Timeline line */}
                  {i !== recentActivity.length - 1 && (
                    <div className="absolute left-[9px] top-6 bottom-[-24px] w-px bg-border"></div>
                  )}
                  {/* Timeline dot */}
                  <div className={`absolute left-0 top-1.5 w-5 h-5 rounded-full border-2 border-card flex items-center justify-center ${
                    activity.type === 'ingestion_completed' ? 'bg-blue-500' :
                    activity.type === 'record_approved' || activity.type === 'bulk_approved' ? 'bg-green-500' :
                    activity.type === 'record_flagged' ? 'bg-orange-500' :
                    activity.type === 'record_rejected' ? 'bg-red-500' : 'bg-gray-500'
                  }`}>
                  </div>
                  
                  <div className="text-sm">
                    <p className="text-foreground">
                      <span className="font-medium">{activity.actor || 'System'}</span> {activity.description}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">{formatRelativeTime(activity.timestamp)}</p>
                  </div>
                </div>
              ))}
              {!recentActivity?.length && (
                <div className="text-sm text-muted-foreground italic text-center py-4">No recent activity.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
