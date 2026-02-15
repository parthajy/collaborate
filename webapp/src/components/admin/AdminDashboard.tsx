import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Users,
  LayoutGrid,
  ShieldX,
  Layers,
  MessageSquare,
  TrendingUp,
  Eye,
  Ban,
  Clock,
  Activity,
  Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { adminApi, type AdminStats, type FeatureRequest } from "@/lib/admin-api";
import { cn } from "@/lib/utils";

interface AdminDashboardProps {
  onNavigate: (page: "rooms" | "features") => void;
}

const statusColors: Record<FeatureRequest["status"], string> = {
  pending: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  reviewed: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  planned: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  completed: "bg-green-500/20 text-green-400 border-green-500/30",
  rejected: "bg-red-500/20 text-red-400 border-red-500/30",
};

export function AdminDashboard({ onNavigate }: AdminDashboardProps) {
  const queryClient = useQueryClient();

  const { data: stats, isLoading } = useQuery({
    queryKey: ["admin", "stats"],
    queryFn: () => adminApi.getStats(),
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const blockMutation = useMutation({
    mutationFn: ({ slug, blocked }: { slug: string; blocked: boolean }) =>
      adminApi.blockSpace(slug, blocked),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "stats"] });
    },
  });

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-cyan-500" />
      </div>
    );
  }

  const statCards = [
    {
      title: "Total Spaces",
      value: stats?.totalSpaces ?? 0,
      icon: Users,
      color: "from-cyan-500 to-blue-600",
      iconBg: "bg-cyan-500/10",
    },
    {
      title: "Active Rooms",
      value: stats?.activeSpaces ?? 0,
      icon: LayoutGrid,
      color: "from-green-500 to-emerald-600",
      iconBg: "bg-green-500/10",
    },
    {
      title: "Blocked Rooms",
      value: stats?.blockedSpaces ?? 0,
      icon: ShieldX,
      color: "from-red-500 to-rose-600",
      iconBg: "bg-red-500/10",
    },
    {
      title: "Canvas Items",
      value: stats?.totalItems ?? 0,
      icon: Layers,
      color: "from-purple-500 to-violet-600",
      iconBg: "bg-purple-500/10",
    },
    {
      title: "Feature Requests",
      value: stats?.totalFeatureRequests ?? 0,
      icon: MessageSquare,
      color: "from-amber-500 to-orange-600",
      iconBg: "bg-amber-500/10",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Stats Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {statCards.map((stat, index) => (
          <motion.div
            key={stat.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <Card className="bg-slate-900/50 border-slate-800 hover:border-slate-700 transition-colors">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-slate-400 text-sm font-medium">{stat.title}</p>
                    <p className="text-2xl font-bold text-white mt-1">
                      {stat.value.toLocaleString()}
                    </p>
                  </div>
                  <div className={cn("p-2.5 rounded-xl", stat.iconBg)}>
                    <stat.icon className="w-5 h-5 text-white" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Active Rooms */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader className="flex flex-row items-center justify-between pb-4">
              <CardTitle className="text-lg font-semibold text-white flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-cyan-500" />
                Top Active Rooms
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onNavigate("rooms")}
                className="text-slate-400 hover:text-white"
              >
                View All
              </Button>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[300px] pr-4">
                {stats?.topSpaces?.length ? (
                  <div className="space-y-3">
                    {stats.topSpaces.map((room, index) => (
                      <motion.div
                        key={room.slug}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.4 + index * 0.05 }}
                        className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50 border border-slate-700/50 hover:border-slate-600 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500/20 to-blue-600/20 flex items-center justify-center text-cyan-400 font-semibold text-sm">
                            {index + 1}
                          </div>
                          <div>
                            <p className="text-white font-medium">{room.slug}</p>
                            <p className="text-slate-400 text-sm">
                              {room.itemCount} items
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge
                            className={cn(
                              "border",
                              room.status === "active"
                                ? "bg-green-500/20 text-green-400 border-green-500/30"
                                : "bg-red-500/20 text-red-400 border-red-500/30"
                            )}
                          >
                            {room.status}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-slate-400 hover:text-white"
                            onClick={() => window.open(`/${room.slug}`, "_blank")}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className={cn(
                              "h-8 w-8",
                              room.status === "blocked"
                                ? "text-green-400 hover:text-green-300"
                                : "text-red-400 hover:text-red-300"
                            )}
                            onClick={() =>
                              blockMutation.mutate({
                                slug: room.slug,
                                blocked: room.status !== "blocked",
                              })
                            }
                            disabled={blockMutation.isPending}
                          >
                            <Ban className="w-4 h-4" />
                          </Button>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-slate-400">
                    <LayoutGrid className="w-12 h-12 mb-3 opacity-50" />
                    <p>No active rooms yet</p>
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </motion.div>

        {/* Recent Activity */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg font-semibold text-white flex items-center gap-2">
                <Activity className="w-5 h-5 text-purple-500" />
                Recent Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[300px] pr-4">
                {stats?.recentActivity?.length ? (
                  <div className="space-y-3">
                    {stats.recentActivity.map((activity, index) => (
                      <motion.div
                        key={activity.id}
                        initial={{ opacity: 0, x: 10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.4 + index * 0.05 }}
                        className="flex items-start gap-3 p-3 rounded-lg bg-slate-800/50 border border-slate-700/50"
                      >
                        <div className="w-2 h-2 rounded-full bg-cyan-500 mt-2 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-sm">
                            <span className="text-cyan-400 font-medium">
                              {activity.type}
                            </span>{" "}
                            in{" "}
                            <span className="text-slate-300 font-medium">
                              {activity.spaceSlug}
                            </span>
                          </p>
                          {activity.details ? (
                            <p className="text-slate-400 text-xs mt-1 truncate">
                              {activity.details}
                            </p>
                          ) : null}
                          <p className="text-slate-500 text-xs mt-1 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatDate(activity.createdAt)}
                          </p>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-slate-400">
                    <Activity className="w-12 h-12 mb-3 opacity-50" />
                    <p>No recent activity</p>
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Feature Requests Preview */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
      >
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader className="flex flex-row items-center justify-between pb-4">
            <CardTitle className="text-lg font-semibold text-white flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-amber-500" />
              Recent Feature Requests
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onNavigate("features")}
              className="text-slate-400 hover:text-white"
            >
              View All
            </Button>
          </CardHeader>
          <CardContent>
            <FeatureRequestsPreview />
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

function FeatureRequestsPreview() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "features", "preview"],
    queryFn: () => adminApi.getFeatures({ page: 1, limit: 5 }),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-cyan-500" />
      </div>
    );
  }

  if (!data?.items?.length) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-slate-400">
        <MessageSquare className="w-12 h-12 mb-3 opacity-50" />
        <p>No feature requests yet</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {data.items.slice(0, 6).map((request, index) => (
        <motion.div
          key={request.id}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.6 + index * 0.05 }}
          className="p-4 rounded-lg bg-slate-800/50 border border-slate-700/50 hover:border-slate-600 transition-colors"
        >
          <div className="flex items-start justify-between gap-2 mb-2">
            <h4 className="text-white font-medium text-sm line-clamp-1">{request.title}</h4>
            <Badge
              className={cn(
                "border flex-shrink-0 text-xs",
                statusColors[request.status]
              )}
            >
              {request.status}
            </Badge>
          </div>
          <p className="text-slate-400 text-xs line-clamp-2 mb-3">{request.description}</p>
          <div className="flex items-center justify-between text-xs text-slate-500">
            {request.email ? (
              <span className="truncate max-w-[120px]">{request.email}</span>
            ) : (
              <span>Anonymous</span>
            )}
            <span>{new Date(request.createdAt).toLocaleDateString()}</span>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
