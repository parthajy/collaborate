import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Lock, User, KeyRound, ArrowRight, Loader2, Mail, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { adminApi } from "@/lib/admin-api";
import { cn } from "@/lib/utils";

interface AdminLoginProps {
  onLoginSuccess: () => void;
}

export function AdminLogin({ onLoginSuccess }: AdminLoginProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false);
  const [resetStep, setResetStep] = useState<"email" | "token">("email");
  const [resetEmail, setResetEmail] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [resetMessage, setResetMessage] = useState<string | null>(null);

  const loginMutation = useMutation({
    mutationFn: () => adminApi.login(username, password),
    onSuccess: () => {
      onLoginSuccess();
    },
    onError: (err: Error) => {
      setError(err.message || "Invalid credentials");
    },
  });

  const forgotPasswordMutation = useMutation({
    mutationFn: () => adminApi.forgotPassword(resetEmail),
    onSuccess: (data) => {
      setResetMessage(data?.message || "Reset instructions sent to your email");
      setResetStep("token");
    },
    onError: (err: Error) => {
      setResetMessage(err.message || "Failed to send reset email");
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: () => adminApi.resetPassword(resetToken, newPassword),
    onSuccess: (data) => {
      setResetMessage(data?.message || "Password reset successful! You can now login.");
      setTimeout(() => {
        setForgotPasswordOpen(false);
        setResetStep("email");
        setResetEmail("");
        setResetToken("");
        setNewPassword("");
        setResetMessage(null);
      }, 2000);
    },
    onError: (err: Error) => {
      setResetMessage(err.message || "Failed to reset password");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    loginMutation.mutate();
  };

  const handleForgotPassword = (e: React.FormEvent) => {
    e.preventDefault();
    setResetMessage(null);
    if (resetStep === "email") {
      forgotPasswordMutation.mutate();
    } else {
      resetPasswordMutation.mutate();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-4">
      {/* Background pattern */}
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiMyMDI5M2EiIGZpbGwtb3BhY2l0eT0iMC40Ij48cGF0aCBkPSJNMzYgMzRoLTJ2LTRoMnY0em0wLTZ2LTRoLTJ2NGgyem0tNiA2di00aC00djRoNHptMC02di00aC00djRoNHoiLz48L2c+PC9nPjwvc3ZnPg==')] opacity-30" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative w-full max-w-md"
      >
        {/* Glow effect */}
        <div className="absolute -inset-1 bg-gradient-to-r from-cyan-500/20 via-blue-500/20 to-purple-500/20 rounded-2xl blur-xl" />

        <div className="relative bg-slate-900/90 backdrop-blur-xl border border-slate-800 rounded-2xl shadow-2xl p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 mb-4"
            >
              <Lock className="w-8 h-8 text-white" />
            </motion.div>
            <h1 className="text-2xl font-bold text-white mb-2">Admin Portal</h1>
            <p className="text-slate-400 text-sm">Enter your credentials to continue</p>
          </div>

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="username" className="text-slate-300 text-sm font-medium">
                Username
              </Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <Input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter username"
                  className="pl-10 bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500 focus:border-cyan-500 focus:ring-cyan-500/20 h-11"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-slate-300 text-sm font-medium">
                Password
              </Label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  className="pl-10 bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500 focus:border-cyan-500 focus:ring-cyan-500/20 h-11"
                  required
                />
              </div>
            </div>

            {error ? (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2"
              >
                {error}
              </motion.div>
            ) : null}

            <Button
              type="submit"
              disabled={loginMutation.isPending}
              className="w-full h-11 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white font-medium rounded-lg transition-all duration-200 shadow-lg shadow-cyan-500/25"
            >
              {loginMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <ArrowRight className="w-4 h-4 mr-2" />
              )}
              {loginMutation.isPending ? "Signing in..." : "Sign In"}
            </Button>

            <button
              type="button"
              onClick={() => setForgotPasswordOpen(true)}
              className="w-full text-center text-sm text-slate-400 hover:text-cyan-400 transition-colors"
            >
              Forgot your password?
            </button>
          </form>
        </div>
      </motion.div>

      {/* Forgot Password Dialog */}
      <Dialog open={forgotPasswordOpen} onOpenChange={setForgotPasswordOpen}>
        <DialogContent className="bg-slate-900 border-slate-800 text-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white">Reset Password</DialogTitle>
            <DialogDescription className="text-slate-400">
              {resetStep === "email"
                ? "Enter your email to receive a password reset link"
                : "Enter the token from your email and your new password"}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleForgotPassword} className="space-y-4 mt-4">
            {resetStep === "email" ? (
              <div className="space-y-2">
                <Label htmlFor="reset-email" className="text-slate-300">
                  Email Address
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <Input
                    id="reset-email"
                    type="email"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    placeholder="admin@example.com"
                    className="pl-10 bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500"
                    required
                  />
                </div>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="reset-token" className="text-slate-300">
                    Reset Token
                  </Label>
                  <Input
                    id="reset-token"
                    type="text"
                    value={resetToken}
                    onChange={(e) => setResetToken(e.target.value)}
                    placeholder="Enter token from email"
                    className="bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-password" className="text-slate-300">
                    New Password
                  </Label>
                  <Input
                    id="new-password"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password"
                    className="bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500"
                    required
                  />
                </div>
              </>
            )}

            {resetMessage ? (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  "text-sm rounded-lg px-4 py-2",
                  resetMessage.includes("success") || resetMessage.includes("sent")
                    ? "text-green-400 bg-green-500/10 border border-green-500/20"
                    : "text-red-400 bg-red-500/10 border border-red-500/20"
                )}
              >
                {resetMessage}
              </motion.div>
            ) : null}

            <div className="flex gap-3">
              {resetStep === "token" ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setResetStep("email");
                    setResetMessage(null);
                  }}
                  className="flex-1 border-slate-700 text-slate-300 hover:bg-slate-800"
                >
                  Back
                </Button>
              ) : null}
              <Button
                type="submit"
                disabled={forgotPasswordMutation.isPending || resetPasswordMutation.isPending}
                className={cn(
                  "bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white",
                  resetStep === "email" ? "w-full" : "flex-1"
                )}
              >
                {forgotPasswordMutation.isPending || resetPasswordMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : null}
                {resetStep === "email" ? "Send Reset Link" : "Reset Password"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
