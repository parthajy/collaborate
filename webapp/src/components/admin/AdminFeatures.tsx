import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageSquare,
  Filter,
  Trash2,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Mail,
  Hash,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  Clock,
  XCircle,
  Eye,
  ListTodo,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { adminApi, type FeatureRequest } from "@/lib/admin-api";
import { cn } from "@/lib/utils";

const statusConfig: Record<
  FeatureRequest["status"],
  { color: string; icon: React.ElementType; label: string }
> = {
  pending: {
    color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    icon: Clock,
    label: "Pending",
  },
  reviewed: {
    color: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    icon: Eye,
    label: "Reviewed",
  },
  planned: {
    color: "bg-purple-500/20 text-purple-400 border-purple-500/30",
    icon: ListTodo,
    label: "Planned",
  },
  completed: {
    color: "bg-green-500/20 text-green-400 border-green-500/30",
    icon: CheckCircle2,
    label: "Completed",
  },
  rejected: {
    color: "bg-red-500/20 text-red-400 border-red-500/30",
    icon: XCircle,
    label: "Rejected",
  },
};

export function AdminFeatures() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedRequest, setSelectedRequest] = useState<FeatureRequest | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<FeatureRequest | null>(null);

  const limit = 20;

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "features", { page, status: statusFilter === "all" ? "" : statusFilter, limit }],
    queryFn: () =>
      adminApi.getFeatures({
        page,
        limit,
        status: statusFilter === "all" ? undefined : statusFilter,
      }),
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      adminApi.updateFeatureStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "features"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "stats"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminApi.deleteFeature(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "features"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "stats"] });
      setDeleteDialogOpen(false);
      setDeleteTarget(null);
    },
  });

  const openDeleteDialog = (request: FeatureRequest) => {
    setDeleteTarget(request);
    setDeleteDialogOpen(true);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const totalPages = data?.totalPages || 1;

  return (
    <div className="space-y-6">
      {/* Header & Filters */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg font-semibold text-white flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-amber-500" />
            Feature Requests
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4">
            <Select
              value={statusFilter}
              onValueChange={(v) => {
                setStatusFilter(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-full sm:w-[200px] bg-slate-800/50 border-slate-700 text-white">
                <Filter className="w-4 h-4 mr-2 text-slate-400" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-800">
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="reviewed">Reviewed</SelectItem>
                <SelectItem value="planned">Planned</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>

            {/* Status counts */}
            <div className="flex flex-wrap gap-2">
              {Object.entries(statusConfig).map(([status, config]) => {
                const StatusIcon = config.icon;
                return (
                  <button
                    key={status}
                    onClick={() => {
                      setStatusFilter(status);
                      setPage(1);
                    }}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all",
                      statusFilter === status
                        ? config.color
                        : "border-slate-700 text-slate-400 hover:border-slate-600"
                    )}
                  >
                    <StatusIcon className="w-3 h-3" />
                    {config.label}
                  </button>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-cyan-500" />
            </div>
          ) : !data?.items?.length ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400">
              <MessageSquare className="w-16 h-16 mb-4 opacity-50" />
              <p className="text-lg">No feature requests found</p>
              <p className="text-sm text-slate-500 mt-1">
                {statusFilter !== "all"
                  ? "Try selecting a different status filter"
                  : "Feature requests will appear here once submitted"}
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-slate-800 hover:bg-transparent">
                      <TableHead className="text-slate-400">Title</TableHead>
                      <TableHead className="text-slate-400">Status</TableHead>
                      <TableHead className="text-slate-400">Email</TableHead>
                      <TableHead className="text-slate-400">Space</TableHead>
                      <TableHead className="text-slate-400">Created</TableHead>
                      <TableHead className="text-slate-400 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <AnimatePresence mode="popLayout">
                      {data.items.map((request, index) => {
                        const config = statusConfig[request.status];
                        const StatusIcon = config.icon;
                        return (
                          <motion.tr
                            key={request.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ delay: index * 0.03 }}
                            className="border-slate-800 hover:bg-slate-800/30"
                          >
                            <TableCell className="font-medium text-white max-w-[250px]">
                              <button
                                onClick={() => setSelectedRequest(request)}
                                className="text-left hover:text-cyan-400 transition-colors"
                              >
                                <p className="truncate">{request.title}</p>
                                <p className="text-slate-500 text-xs truncate mt-0.5">
                                  {request.description}
                                </p>
                              </button>
                            </TableCell>
                            <TableCell>
                              <Select
                                value={request.status}
                                onValueChange={(status) =>
                                  updateStatusMutation.mutate({ id: request.id, status })
                                }
                                disabled={updateStatusMutation.isPending}
                              >
                                <SelectTrigger
                                  className={cn(
                                    "w-[130px] h-8 border text-xs",
                                    config.color,
                                    "bg-transparent"
                                  )}
                                >
                                  <StatusIcon className="w-3 h-3 mr-1" />
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-slate-900 border-slate-800">
                                  {Object.entries(statusConfig).map(([status, cfg]) => {
                                    const Icon = cfg.icon;
                                    return (
                                      <SelectItem key={status} value={status}>
                                        <div className="flex items-center gap-2">
                                          <Icon className="w-3 h-3" />
                                          {cfg.label}
                                        </div>
                                      </SelectItem>
                                    );
                                  })}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell className="text-slate-300">
                              {request.email ? (
                                <div className="flex items-center gap-1.5">
                                  <Mail className="w-3 h-3 text-slate-500" />
                                  <span className="truncate max-w-[150px]">{request.email}</span>
                                </div>
                              ) : (
                                <span className="text-slate-500">-</span>
                              )}
                            </TableCell>
                            <TableCell className="text-slate-300">
                              {request.spaceSlug ? (
                                <div className="flex items-center gap-1.5">
                                  <Hash className="w-3 h-3 text-slate-500" />
                                  <span>{request.spaceSlug}</span>
                                </div>
                              ) : (
                                <span className="text-slate-500">-</span>
                              )}
                            </TableCell>
                            <TableCell className="text-slate-400">
                              <div className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {formatDate(request.createdAt)}
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-slate-400 hover:text-white"
                                  onClick={() => setSelectedRequest(request)}
                                >
                                  <Eye className="w-4 h-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-red-400 hover:text-red-300"
                                  onClick={() => openDeleteDialog(request)}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </motion.tr>
                        );
                      })}
                    </AnimatePresence>
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between px-6 py-4 border-t border-slate-800">
                <p className="text-sm text-slate-400">
                  Showing {(page - 1) * limit + 1} to {Math.min(page * limit, data.total)} of{" "}
                  {data.total} requests
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="border-slate-700 text-slate-300 hover:bg-slate-800"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <span className="text-sm text-slate-400">
                    Page {page} of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    className="border-slate-700 text-slate-300 hover:bg-slate-800"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Request Details Dialog */}
      <Dialog open={!!selectedRequest} onOpenChange={() => setSelectedRequest(null)}>
        <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-white pr-8">{selectedRequest?.title}</DialogTitle>
            <DialogDescription className="text-slate-400">
              Feature request details
            </DialogDescription>
          </DialogHeader>

          {selectedRequest ? (
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700">
                <p className="text-slate-300 text-sm whitespace-pre-wrap">
                  {selectedRequest.description}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700">
                  <p className="text-slate-400 text-xs mb-1">Status</p>
                  <Select
                    value={selectedRequest.status}
                    onValueChange={(status) => {
                      updateStatusMutation.mutate({ id: selectedRequest.id, status });
                      setSelectedRequest({ ...selectedRequest, status: status as FeatureRequest["status"] });
                    }}
                    disabled={updateStatusMutation.isPending}
                  >
                    <SelectTrigger
                      className={cn(
                        "w-full h-8 border text-xs",
                        statusConfig[selectedRequest.status].color,
                        "bg-transparent"
                      )}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-900 border-slate-800">
                      {Object.entries(statusConfig).map(([status, cfg]) => {
                        const Icon = cfg.icon;
                        return (
                          <SelectItem key={status} value={status}>
                            <div className="flex items-center gap-2">
                              <Icon className="w-3 h-3" />
                              {cfg.label}
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
                <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700">
                  <p className="text-slate-400 text-xs mb-1">Created</p>
                  <p className="text-white text-sm">{formatDate(selectedRequest.createdAt)}</p>
                </div>
                {selectedRequest.email ? (
                  <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700">
                    <p className="text-slate-400 text-xs mb-1">Email</p>
                    <p className="text-white text-sm flex items-center gap-1.5">
                      <Mail className="w-3 h-3 text-slate-500" />
                      {selectedRequest.email}
                    </p>
                  </div>
                ) : null}
                {selectedRequest.spaceSlug ? (
                  <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700">
                    <p className="text-slate-400 text-xs mb-1">From Space</p>
                    <p className="text-white text-sm flex items-center gap-1.5">
                      <Hash className="w-3 h-3 text-slate-500" />
                      {selectedRequest.spaceSlug}
                    </p>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSelectedRequest(null)}
              className="border-slate-700 text-slate-300 hover:bg-slate-800"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="bg-slate-900 border-slate-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              Delete Feature Request
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Are you sure you want to delete this feature request? This action cannot be undone.
              <br />
              <br />
              <span className="text-slate-300 font-medium">"{deleteTarget?.title}"</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-slate-700 text-slate-300 hover:bg-slate-800 bg-transparent">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              disabled={deleteMutation.isPending}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {deleteMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Trash2 className="w-4 h-4 mr-2" />
              )}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
