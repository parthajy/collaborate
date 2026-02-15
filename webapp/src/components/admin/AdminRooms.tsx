import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Filter,
  Eye,
  Ban,
  Trash2,
  LayoutGrid,
  Loader2,
  ChevronLeft,
  ChevronRight,
  X,
  Calendar,
  Hash,
  AlertTriangle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { adminApi, type Space, type SpaceDetails } from "@/lib/admin-api";
import { cn } from "@/lib/utils";

export function AdminRooms() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [searchInput, setSearchInput] = useState("");
  const [selectedSpace, setSelectedSpace] = useState<string | null>(null);
  const [blockDialogOpen, setBlockDialogOpen] = useState(false);
  const [blockTarget, setBlockTarget] = useState<Space | null>(null);
  const [blockReason, setBlockReason] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Space | null>(null);

  const limit = 20;

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "spaces", { page, search, filter, limit }],
    queryFn: () => adminApi.getSpaces({ page, limit, search, filter }),
  });

  const { data: spaceDetails, isLoading: isLoadingDetails } = useQuery({
    queryKey: ["admin", "space", selectedSpace],
    queryFn: () => (selectedSpace ? adminApi.getSpace(selectedSpace) : null),
    enabled: !!selectedSpace,
  });

  const blockMutation = useMutation({
    mutationFn: ({ slug, blocked, reason }: { slug: string; blocked: boolean; reason?: string }) =>
      adminApi.blockSpace(slug, blocked, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "spaces"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "stats"] });
      setBlockDialogOpen(false);
      setBlockTarget(null);
      setBlockReason("");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (slug: string) => adminApi.deleteSpace(slug),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "spaces"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "stats"] });
      setDeleteDialogOpen(false);
      setDeleteTarget(null);
    },
  });

  const handleSearch = () => {
    setSearch(searchInput);
    setPage(1);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  const openBlockDialog = (space: Space) => {
    setBlockTarget(space);
    setBlockReason(space.blockedReason || "");
    setBlockDialogOpen(true);
  };

  const openDeleteDialog = (space: Space) => {
    setDeleteTarget(space);
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
            <LayoutGrid className="w-5 h-5 text-cyan-500" />
            Rooms Management
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <Input
                placeholder="Search by slug..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={handleKeyDown}
                className="pl-10 bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500"
              />
            </div>
            <Select value={filter} onValueChange={(v) => { setFilter(v); setPage(1); }}>
              <SelectTrigger className="w-full sm:w-[180px] bg-slate-800/50 border-slate-700 text-white">
                <Filter className="w-4 h-4 mr-2 text-slate-400" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-800">
                <SelectItem value="all">All Rooms</SelectItem>
                <SelectItem value="active">Active Only</SelectItem>
                <SelectItem value="blocked">Blocked Only</SelectItem>
              </SelectContent>
            </Select>
            <Button
              onClick={handleSearch}
              className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white"
            >
              <Search className="w-4 h-4 mr-2" />
              Search
            </Button>
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
              <LayoutGrid className="w-16 h-16 mb-4 opacity-50" />
              <p className="text-lg">No rooms found</p>
              <p className="text-sm text-slate-500 mt-1">
                {search ? "Try adjusting your search criteria" : "Rooms will appear here once created"}
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-slate-800 hover:bg-transparent">
                      <TableHead className="text-slate-400">Slug</TableHead>
                      <TableHead className="text-slate-400">Items</TableHead>
                      <TableHead className="text-slate-400">Status</TableHead>
                      <TableHead className="text-slate-400">Created</TableHead>
                      <TableHead className="text-slate-400 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <AnimatePresence mode="popLayout">
                      {data.items.map((space, index) => (
                        <motion.tr
                          key={space.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          transition={{ delay: index * 0.03 }}
                          className="border-slate-800 hover:bg-slate-800/30"
                        >
                          <TableCell className="font-medium text-white">
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500/20 to-blue-600/20 flex items-center justify-center text-cyan-400">
                                <Hash className="w-4 h-4" />
                              </div>
                              {space.slug}
                            </div>
                          </TableCell>
                          <TableCell className="text-slate-300">{space.itemCount}</TableCell>
                          <TableCell>
                            <Badge
                              className={cn(
                                "border",
                                space.status === "active"
                                  ? "bg-green-500/20 text-green-400 border-green-500/30"
                                  : "bg-red-500/20 text-red-400 border-red-500/30"
                              )}
                            >
                              {space.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-slate-400">
                            <div className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {formatDate(space.createdAt)}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-slate-400 hover:text-white"
                                onClick={() => setSelectedSpace(space.slug)}
                              >
                                <Eye className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className={cn(
                                  "h-8 w-8",
                                  space.status === "blocked"
                                    ? "text-green-400 hover:text-green-300"
                                    : "text-amber-400 hover:text-amber-300"
                                )}
                                onClick={() => openBlockDialog(space)}
                              >
                                <Ban className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-red-400 hover:text-red-300"
                                onClick={() => openDeleteDialog(space)}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </motion.tr>
                      ))}
                    </AnimatePresence>
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between px-6 py-4 border-t border-slate-800">
                <p className="text-sm text-slate-400">
                  Showing {((page - 1) * limit) + 1} to {Math.min(page * limit, data.total)} of {data.total} rooms
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

      {/* Space Details Dialog */}
      <Dialog open={!!selectedSpace} onOpenChange={() => setSelectedSpace(null)}>
        <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Hash className="w-5 h-5 text-cyan-500" />
              {selectedSpace}
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Space details and canvas items
            </DialogDescription>
          </DialogHeader>

          {isLoadingDetails ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-cyan-500" />
            </div>
          ) : spaceDetails ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700">
                  <p className="text-slate-400 text-xs mb-1">Status</p>
                  <Badge
                    className={cn(
                      "border",
                      spaceDetails.status === "active"
                        ? "bg-green-500/20 text-green-400 border-green-500/30"
                        : "bg-red-500/20 text-red-400 border-red-500/30"
                    )}
                  >
                    {spaceDetails.status}
                  </Badge>
                </div>
                <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700">
                  <p className="text-slate-400 text-xs mb-1">Total Items</p>
                  <p className="text-white font-semibold">{spaceDetails.itemCount}</p>
                </div>
                <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700">
                  <p className="text-slate-400 text-xs mb-1">Created</p>
                  <p className="text-white text-sm">{formatDate(spaceDetails.createdAt)}</p>
                </div>
                <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700">
                  <p className="text-slate-400 text-xs mb-1">Updated</p>
                  <p className="text-white text-sm">{formatDate(spaceDetails.updatedAt)}</p>
                </div>
              </div>

              {spaceDetails.blockedReason ? (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30">
                  <p className="text-red-400 text-xs mb-1">Block Reason</p>
                  <p className="text-red-300 text-sm">{spaceDetails.blockedReason}</p>
                </div>
              ) : null}

              <div>
                <p className="text-slate-400 text-sm mb-2">Canvas Items ({spaceDetails.items?.length || 0})</p>
                <ScrollArea className="h-[200px] rounded-lg border border-slate-700 bg-slate-800/30">
                  {spaceDetails.items?.length ? (
                    <div className="p-3 space-y-2">
                      {spaceDetails.items.map((item) => (
                        <div
                          key={item.id}
                          className="p-2 rounded bg-slate-800 border border-slate-700 text-sm"
                        >
                          <div className="flex items-center justify-between mb-1">
                            <Badge variant="outline" className="text-xs border-slate-600">
                              {item.type}
                            </Badge>
                            <span className="text-slate-500 text-xs">
                              {formatDate(item.createdAt)}
                            </span>
                          </div>
                          {item.content ? (
                            <p className="text-slate-300 text-xs truncate">{item.content}</p>
                          ) : null}
                          <p className="text-slate-500 text-xs mt-1">
                            Position: ({item.x}, {item.y})
                            {item.width ? ` | Size: ${item.width}x${item.height}` : ""}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-full text-slate-500">
                      No items in this space
                    </div>
                  )}
                </ScrollArea>
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => window.open(`/${selectedSpace}`, "_blank")}
              className="border-slate-700 text-slate-300 hover:bg-slate-800"
            >
              <Eye className="w-4 h-4 mr-2" />
              Open Space
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Block Dialog */}
      <Dialog open={blockDialogOpen} onOpenChange={setBlockDialogOpen}>
        <DialogContent className="bg-slate-900 border-slate-800 text-white">
          <DialogHeader>
            <DialogTitle className="text-white">
              {blockTarget?.status === "blocked" ? "Unblock" : "Block"} Space
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              {blockTarget?.status === "blocked"
                ? `Unblock "${blockTarget?.slug}" to make it accessible again.`
                : `Block "${blockTarget?.slug}" to prevent access. Optionally provide a reason.`}
            </DialogDescription>
          </DialogHeader>

          {blockTarget?.status !== "blocked" ? (
            <div className="space-y-2">
              <Label htmlFor="reason" className="text-slate-300">
                Block Reason (Optional)
              </Label>
              <Textarea
                id="reason"
                value={blockReason}
                onChange={(e) => setBlockReason(e.target.value)}
                placeholder="e.g., Inappropriate content, spam, etc."
                className="bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500"
              />
            </div>
          ) : null}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setBlockDialogOpen(false)}
              className="border-slate-700 text-slate-300 hover:bg-slate-800"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (blockTarget) {
                  blockMutation.mutate({
                    slug: blockTarget.slug,
                    blocked: blockTarget.status !== "blocked",
                    reason: blockReason || undefined,
                  });
                }
              }}
              disabled={blockMutation.isPending}
              className={cn(
                blockTarget?.status === "blocked"
                  ? "bg-green-600 hover:bg-green-700"
                  : "bg-amber-600 hover:bg-amber-700"
              )}
            >
              {blockMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Ban className="w-4 h-4 mr-2" />
              )}
              {blockTarget?.status === "blocked" ? "Unblock" : "Block"} Space
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
              Delete Space
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Are you sure you want to delete "{deleteTarget?.slug}"? This action cannot be undone
              and will permanently delete all {deleteTarget?.itemCount} canvas items.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-slate-700 text-slate-300 hover:bg-slate-800 bg-transparent">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.slug)}
              disabled={deleteMutation.isPending}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {deleteMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Trash2 className="w-4 h-4 mr-2" />
              )}
              Delete Permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
