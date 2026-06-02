import { useListRecords, useBulkApproveRecords, useApproveRecord, useFlagRecord, useRejectRecord, getListRecordsQueryKey } from "@workspace/api-client-react";
import { formatCo2e, formatDate, formatNumber } from "@/lib/formatters";
import { Link, useLocation } from "wouter";
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Check, AlertTriangle, X, CheckSquare, Search, Filter, Download } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export default function ReviewQueue() {
  const [searchParams] = useLocation();
  const search = new URLSearchParams(window.location.search);
  
  const [statusFilter, setStatusFilter] = useState<any>(search.get("status") || "pending");
  const [scopeFilter, setScopeFilter] = useState<any>(search.get("scope") || "");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const { data: pageData, isLoading } = useListRecords({
    status: statusFilter || undefined,
    scope: scopeFilter || undefined,
    pageSize: 100,
  });

  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const bulkApprove = useBulkApproveRecords();
  const approve = useApproveRecord();
  const flag = useFlagRecord();
  const reject = useRejectRecord();

  const handleBulkApprove = () => {
    if (selectedIds.size === 0) return;
    
    bulkApprove.mutate({
      data: { ids: Array.from(selectedIds), reviewedBy: "Current User" }
    }, {
      onSuccess: (res) => {
        toast({ title: `Approved ${res.updated} records` });
        setSelectedIds(new Set());
        queryClient.invalidateQueries({ queryKey: getListRecordsQueryKey() });
      }
    });
  };

  const toggleSelectAll = () => {
    if (!pageData?.records) return;
    if (selectedIds.size === pageData.records.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(pageData.records.map(r => r.id)));
    }
  };

  const toggleSelect = (id: number) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  const handleAction = (action: any, id: number, note?: string) => {
    action.mutate({
      id,
      data: { note, reviewedBy: "Current User" }
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListRecordsQueryKey() });
      }
    });
  };

  const allSelected = pageData?.records?.length && selectedIds.size === pageData.records.length;
  const someSelected = selectedIds.size > 0 && !allSelected;

  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (scopeFilter) params.set("scope", scopeFilter);
      params.set("pageSize", "10000");
      const res = await fetch(`/api/records/export?${params.toString()}`);
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `breathe-esg-export-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast({ title: "Export downloaded", description: `${pageData?.total ?? 0} records exported with scope summary.` });
    } catch {
      toast({ title: "Export failed", description: "Could not download the CSV.", variant: "destructive" });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6 h-[calc(100vh-6rem)] flex flex-col">
      <header className="flex justify-between items-end shrink-0">
        <div>
          <h1 className="text-3xl font-serif font-bold text-foreground">Review Queue</h1>
          <p className="text-muted-foreground mt-2 text-sm">Sign off on pending emissions records or flag anomalies.</p>
        </div>
      </header>

      {/* Toolbar */}
      <div className="flex justify-between items-center bg-card p-3 rounded-md border border-border shadow-sm shrink-0">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Filter className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <select 
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="pl-9 pr-4 py-1.5 text-sm border border-input rounded bg-background"
            >
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="flagged">Flagged</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
          
          <select 
            value={scopeFilter}
            onChange={e => setScopeFilter(e.target.value)}
            className="px-3 py-1.5 text-sm border border-input rounded bg-background"
          >
            <option value="">All Scopes</option>
            <option value="scope1">Scope 1</option>
            <option value="scope2">Scope 2</option>
            <option value="scope3">Scope 3</option>
          </select>

          <span className="text-xs text-muted-foreground border-l border-border pl-3">
            {pageData?.total ?? "…"} records
          </span>
        </div>

        <div className="flex items-center gap-2">
          {selectedIds.size > 0 && (
            <span className="text-sm font-medium text-primary bg-primary/10 px-2 py-1 rounded">
              {selectedIds.size} selected
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={handleExport}
            disabled={isExporting || !pageData?.total}
            title="Export current filter as CSV with scope summary"
          >
            <Download className="w-4 h-4" />
            {isExporting ? "Exporting…" : "Export CSV"}
          </Button>
          <Button 
            variant="default" 
            size="sm" 
            className="gap-2"
            disabled={selectedIds.size === 0 || bulkApprove.isPending}
            onClick={handleBulkApprove}
          >
            <CheckSquare className="w-4 h-4" />
            Bulk Approve
          </Button>
        </div>
      </div>

      {/* Dense Data Table */}
      <div className="border border-border bg-card shadow-sm rounded-md overflow-hidden flex-1 flex flex-col relative">
        {isLoading && <div className="absolute inset-0 bg-background/50 backdrop-blur-sm z-10 flex items-center justify-center"><div className="w-8 h-8 rounded-full border-4 border-primary border-t-transparent animate-spin"></div></div>}
        
        <div className="overflow-auto flex-1">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead className="sticky top-0 bg-muted/95 backdrop-blur z-10 border-b border-border">
              <tr className="text-muted-foreground">
                <th className="p-3 w-10 text-center">
                  <input 
                    type="checkbox" 
                    className="rounded border-input text-primary focus:ring-primary w-4 h-4"
                    checked={allSelected || false}
                    ref={input => { if (input) input.indeterminate = someSelected || false; }}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th className="p-3 font-medium w-24">Status</th>
                <th className="p-3 font-medium">Source Ref</th>
                <th className="p-3 font-medium">Category</th>
                <th className="p-3 font-medium">Date</th>
                <th className="p-3 font-medium text-right">Raw Qty</th>
                <th className="p-3 font-medium text-right">Factor</th>
                <th className="p-3 font-medium text-right bg-primary/5 text-primary-foreground border-l border-border/50">CO₂e (kg)</th>
                <th className="p-3 font-medium w-32">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {pageData?.records?.map((record) => (
                <tr key={record.id} className={`hover:bg-muted/30 transition-colors ${selectedIds.has(record.id) ? 'bg-primary/5' : ''}`}>
                  <td className="p-3 text-center">
                    <input 
                      type="checkbox" 
                      className="rounded border-input text-primary focus:ring-primary w-4 h-4"
                      checked={selectedIds.has(record.id)}
                      onChange={() => toggleSelect(record.id)}
                      disabled={record.status === 'approved'}
                    />
                  </td>
                  <td className="p-3">
                    <RecordStatusBadge status={record.status} flags={record.suspiciousFlags} />
                  </td>
                  <td className="p-3 font-mono text-xs">
                    <Link href={`/records/${record.id}`} className="text-primary hover:underline flex flex-col">
                      <span>{record.sourceRef}</span>
                      <span className="text-muted-foreground text-[10px]">{record.clientName}</span>
                    </Link>
                  </td>
                  <td className="p-3">
                    <div className="flex flex-col">
                      <span className="font-medium">{record.category}</span>
                      <span className="text-muted-foreground text-xs uppercase tracking-wider">{record.scope} • {record.sourceType}</span>
                    </div>
                  </td>
                  <td className="p-3">{formatDate(record.activityDate).split(',')[0]}</td>
                  <td className="p-3 text-right font-mono">
                    {formatNumber(record.rawQuantity, 2)} <span className="text-muted-foreground text-xs">{record.rawUnit}</span>
                  </td>
                  <td className="p-3 text-right font-mono text-xs text-muted-foreground">
                    {formatNumber(record.emissionFactor, 4)}
                    <div className="truncate max-w-[100px] opacity-60" title={record.emissionFactorSource}>{record.emissionFactorSource}</div>
                  </td>
                  <td className="p-3 text-right font-mono font-bold bg-primary/5 border-l border-border/50">
                    {formatNumber(record.co2eKg, 2)}
                  </td>
                  <td className="p-3">
                    {record.status === 'approved' ? (
                      <span className="text-xs text-muted-foreground flex items-center gap-1"><Check className="w-3 h-3"/> Locked</span>
                    ) : (
                      <div className="flex gap-1">
                        <Button 
                          size="icon" 
                          variant="ghost" 
                          className="h-7 w-7 text-green-600 hover:text-green-700 hover:bg-green-100 dark:hover:bg-green-900/30"
                          title="Approve"
                          onClick={() => handleAction(approve, record.id)}
                        >
                          <Check className="w-4 h-4" />
                        </Button>
                        <Button 
                          size="icon" 
                          variant="ghost" 
                          className="h-7 w-7 text-orange-600 hover:text-orange-700 hover:bg-orange-100 dark:hover:bg-orange-900/30"
                          title="Flag Issue"
                          onClick={() => handleAction(flag, record.id, "Analyst flagged for review")}
                        >
                          <AlertTriangle className="w-4 h-4" />
                        </Button>
                        <Button 
                          size="icon" 
                          variant="ghost" 
                          className="h-7 w-7 text-red-600 hover:text-red-700 hover:bg-red-100 dark:hover:bg-red-900/30"
                          title="Reject"
                          onClick={() => handleAction(reject, record.id, "Invalid data")}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {!pageData?.records?.length && !isLoading && (
                <tr>
                  <td colSpan={9} className="p-12 text-center text-muted-foreground">
                    <div className="flex flex-col items-center justify-center">
                      <CheckCircle2 className="w-12 h-12 text-muted mb-4" />
                      <p className="text-lg font-medium text-foreground">Queue is empty</p>
                      <p className="text-sm">No records match the current filters.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        
        {pageData && (
          <div className="p-3 border-t border-border bg-muted/30 text-sm text-muted-foreground flex justify-between items-center">
            <span>Showing {pageData.records.length} of {pageData.total} records</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={pageData.page === 1}>Previous</Button>
              <Button variant="outline" size="sm" disabled={pageData.records.length < pageData.pageSize}>Next</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function RecordStatusBadge({ status, flags }: { status: string, flags?: string[] }) {
  const isFlagged = flags && flags.length > 0;
  
  if (status === 'approved') return <span className="inline-flex w-20 justify-center items-center px-2 py-1 rounded text-[10px] uppercase tracking-wider font-bold bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-400 border border-green-200 dark:border-green-800/50">Approved</span>;
  if (status === 'rejected') return <span className="inline-flex w-20 justify-center items-center px-2 py-1 rounded text-[10px] uppercase tracking-wider font-bold bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-400 border border-red-200 dark:border-red-800/50">Rejected</span>;
  
  if (status === 'flagged' || isFlagged) return (
    <div className="flex flex-col gap-1 items-start w-20">
      <span className="inline-flex w-full justify-center items-center px-2 py-1 rounded text-[10px] uppercase tracking-wider font-bold bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-400 border border-orange-200 dark:border-orange-800/50">Review</span>
      {isFlagged && <span className="text-[9px] text-orange-600 dark:text-orange-400 font-medium whitespace-nowrap overflow-hidden text-ellipsis w-full text-center">{flags.length} issue{flags.length > 1?'s':''}</span>}
    </div>
  );
  
  return <span className="inline-flex w-20 justify-center items-center px-2 py-1 rounded text-[10px] uppercase tracking-wider font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-400 border border-amber-200 dark:border-amber-800/50">Pending</span>;
}

import { CheckCircle2 } from "lucide-react";
