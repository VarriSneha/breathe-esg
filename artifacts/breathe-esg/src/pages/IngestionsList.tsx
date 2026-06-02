import { useListIngestions } from "@workspace/api-client-react";
import { formatDate, formatNumber } from "@/lib/formatters";
import { Link } from "wouter";
import { FileUp, UploadCloud, AlertCircle, CheckCircle2, Loader2, ArrowRight, Download } from "lucide-react";
import { useState, useRef } from "react";
import { useToast } from "@/hooks/use-toast";

export default function IngestionsList() {
  const { data: ingestions, isLoading, refetch } = useListIngestions();
  
  if (isLoading) {
    return <div className="animate-pulse h-96 bg-muted rounded-md w-full"></div>;
  }

  return (
    <div className="space-y-8">
      <header className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-serif font-bold text-foreground">Data Ingestions</h1>
          <p className="text-muted-foreground mt-2 text-sm">Upload and track raw data processing runs.</p>
        </div>
        <UploadDialog onComplete={refetch} />
      </header>

      <div className="border border-border bg-card rounded-md shadow-sm overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead>
            <tr className="bg-muted/50 border-b border-border">
              <th className="p-4 font-medium">Status</th>
              <th className="p-4 font-medium">File Name</th>
              <th className="p-4 font-medium">Source Type</th>
              <th className="p-4 font-medium">Client</th>
              <th className="p-4 font-medium text-right">Total Rows</th>
              <th className="p-4 font-medium text-right">Failed</th>
              <th className="p-4 font-medium text-right">Created At</th>
              <th className="p-4 font-medium text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {ingestions?.map((run) => (
              <tr key={run.id} className="hover:bg-muted/30 transition-colors group">
                <td className="p-4">
                  <StatusBadge status={run.status} />
                </td>
                <td className="p-4 font-medium text-foreground">
                  <div className="flex items-center gap-2">
                    <FileUp className="w-4 h-4 text-muted-foreground" />
                    {run.fileName}
                  </div>
                </td>
                <td className="p-4 capitalize">
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-secondary/10 text-secondary-foreground">
                    {run.sourceType}
                  </span>
                </td>
                <td className="p-4">{run.clientName}</td>
                <td className="p-4 text-right font-mono text-muted-foreground">{formatNumber(run.totalRows)}</td>
                <td className="p-4 text-right font-mono">
                  {run.failedRows > 0 ? (
                    <span className="text-destructive font-bold">{formatNumber(run.failedRows)}</span>
                  ) : (
                    <span className="text-muted-foreground">0</span>
                  )}
                </td>
                <td className="p-4 text-right text-muted-foreground whitespace-nowrap">{formatDate(run.createdAt)}</td>
                <td className="p-4 text-right">
                  <Link href={`/ingestions/${run.id}`} className="inline-flex items-center gap-1 text-primary hover:text-primary/80 font-medium text-xs opacity-0 group-hover:opacity-100 transition-opacity">
                    View Details <ArrowRight className="w-3 h-3" />
                  </Link>
                </td>
              </tr>
            ))}
            {!ingestions?.length && (
              <tr>
                <td colSpan={8} className="p-8 text-center text-muted-foreground">
                  No ingestion runs found. Upload a file to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
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

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

const SAMPLE_FILES: Record<"sap" | "utility" | "travel", { filename: string; label: string; hint: string }> = {
  sap: {
    filename: "sap-sample.csv",
    label: "SAP Fuel/Procurement (CSV)",
    hint: "MM60-style export — semicolon delimited, German column names, multi-plant",
  },
  utility: {
    filename: "utility-sample.csv",
    label: "Utility Electricity (CSV)",
    hint: "Portal export — meter ID, billing period, kWh, country for grid EF selection",
  },
  travel: {
    filename: "travel-sample.csv",
    label: "Concur Travel (CSV)",
    hint: "Concur-style trip export — air, hotel, rail, ground; class of service included",
  },
};

function UploadDialog({ onComplete }: { onComplete: () => void }) {
  const [open, setOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [sourceType, setSourceType] = useState<"sap" | "utility" | "travel">("sap");
  const [clientName, setClientName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fileInputRef.current?.files?.length) return;
    
    setIsUploading(true);
    const file = fileInputRef.current.files[0];
    const formData = new FormData();
    formData.append("file", file);
    formData.append("clientName", clientName || "Acme Corp");

    try {
      const response = await fetch(`/api/ingestions/${sourceType}`, {
        method: "POST",
        body: formData,
      });
      
      if (!response.ok) throw new Error("Upload failed");
      
      toast({ title: "Upload started", description: "File is processing in the background." });
      setOpen(false);
      onComplete();
    } catch (error) {
      toast({ title: "Upload error", description: "Something went wrong.", variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  };

  const sample = SAMPLE_FILES[sourceType];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <UploadCloud className="w-4 h-4" />
          New Ingestion
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>Upload Raw Data</DialogTitle>
          <DialogDescription>
            Select a source type and upload the flat file export for processing.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleUpload} className="space-y-5 pt-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Source Type</label>
            <select 
              value={sourceType} 
              onChange={(e) => setSourceType(e.target.value as "sap" | "utility" | "travel")}
              className="w-full p-2 border border-input rounded-md bg-background text-sm"
            >
              <option value="sap">SAP Fuel/Procurement (CSV)</option>
              <option value="utility">Utility Electricity (CSV)</option>
              <option value="travel">Concur Travel (CSV)</option>
            </select>
          </div>

          <div className="rounded-md border border-border bg-muted/30 p-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium text-foreground">Sample file available</p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{sample.hint}</p>
            </div>
            <a
              href={`/samples/${sample.filename}`}
              download={sample.filename}
              className="shrink-0 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 border border-primary/30 rounded px-2.5 py-1.5 bg-primary/5 hover:bg-primary/10 transition-colors"
            >
              <Download className="w-3 h-3" />
              Download
            </a>
          </div>
          
          <div className="space-y-2">
            <label className="text-sm font-medium">Client Name</label>
            <input 
              type="text" 
              required
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="e.g. Meridian Energy Group"
              className="w-full p-2 border border-input rounded-md bg-background text-sm"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">File</label>
            <div className="border-2 border-dashed border-input rounded-md p-5 flex flex-col items-center justify-center bg-muted/20">
              <input 
                type="file" 
                required
                accept=".csv"
                ref={fileInputRef}
                className="w-full text-sm text-muted-foreground file:mr-4 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:font-medium file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-1">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={isUploading}>
              {isUploading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Upload & Process
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
