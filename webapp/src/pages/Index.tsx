import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Users, Zap, Globe } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const SLUG_REGEX = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/;

const exampleSpaces = [
  { name: "team-brainstorm", color: "bg-sticky-yellow" },
  { name: "product-ideas", color: "bg-sticky-pink" },
  { name: "design-sprint", color: "bg-sticky-blue" },
];

export default function Index() {
  const navigate = useNavigate();
  const [spaceName, setSpaceName] = useState("");
  const [error, setError] = useState("");

  const validateSlug = (slug: string): boolean => {
    if (slug.length < 2) {
      setError("Space name must be at least 2 characters");
      return false;
    }
    if (slug.length > 50) {
      setError("Space name must be 50 characters or less");
      return false;
    }
    if (!SLUG_REGEX.test(slug)) {
      setError("Use lowercase letters, numbers, and hyphens only");
      return false;
    }
    setError("");
    return true;
  };

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const slug = spaceName.toLowerCase().trim();
      if (validateSlug(slug)) {
        navigate(`/${slug}`);
      }
    },
    [spaceName, navigate]
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "");
    setSpaceName(value);
    if (error && value.length >= 2) {
      setError("");
    }
  };

  return (
    <div className="min-h-screen bg-background overflow-hidden">
      {/* Background decoration */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-[10%] w-64 h-64 bg-sticky-yellow/30 rounded-full blur-3xl" />
        <div className="absolute top-40 right-[15%] w-48 h-48 bg-sticky-pink/30 rounded-full blur-3xl" />
        <div className="absolute bottom-32 left-[20%] w-56 h-56 bg-sticky-blue/30 rounded-full blur-3xl" />
        <div className="absolute -bottom-20 right-[10%] w-72 h-72 bg-sticky-green/30 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 max-w-5xl mx-auto px-6 py-12 md:py-20">
        {/* Header */}
        <motion.header
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex items-center justify-between mb-16 md:mb-24"
        >
          <div className="flex items-center gap-3">
  <img
    src="/favicon.png"
    alt="Collaborate"
    className="w-7 h-7 rounded-md"
  />
  <span className="text-xl font-semibold tracking-tight">Collaborate</span>
</div>

        </motion.header>

        {/* Hero */}
        <div className="text-center mb-16">
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight mb-6"
          >
            A link is the room
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-12"
          >
            Create a collaborative space in seconds. No accounts, no setup. Just share the link and start brainstorming together.
          </motion.p>

          {/* Main input */}
          <motion.form
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            onSubmit={handleSubmit}
            className="max-w-lg mx-auto"
          >
            <div className="relative">
              <div className="flex items-center bg-card border border-border rounded-2xl overflow-hidden shadow-lg focus-within:ring-2 focus-within:ring-primary/50 transition-shadow">
                <span className="pl-5 text-muted-foreground font-mono text-sm">
                  collaborate.so/
                </span>
                <Input
                  type="text"
                  value={spaceName}
                  onChange={handleInputChange}
                  placeholder="your-space"
                  className="flex-1 border-0 bg-transparent text-lg font-mono focus-visible:ring-0 focus-visible:ring-offset-0 pl-0"
                  autoFocus
                />
                <Button
                  type="submit"
                  size="lg"
                  className="m-2 rounded-xl"
                  disabled={spaceName.length < 2}
                >
                  <span className="hidden sm:inline mr-2">Create Space</span>
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </div>
              {error ? (
                <p className="text-destructive text-sm mt-2 text-left pl-4">
                  {error}
                </p>
              ) : null}
            </div>
          </motion.form>

          {/* Example spaces */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.5 }}
            className="flex flex-wrap items-center justify-center gap-3 mt-8"
          >
            <span className="text-sm text-muted-foreground">Try:</span>
            {exampleSpaces.map((space) => (
              <button
                key={space.name}
                onClick={() => navigate(`/${space.name}`)}
                className={`px-4 py-2 ${space.color} rounded-xl text-sm font-medium text-foreground/80 hover:scale-105 transition-transform cursor-pointer`}
              >
                /{space.name}
              </button>
            ))}
          </motion.div>
        </div>

        {/* Features */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.6 }}
          className="grid md:grid-cols-3 gap-6 mt-20"
        >
          <FeatureCard
            icon={<Zap className="w-6 h-6" />}
            title="Instant"
            description="No signup, no login. Just create a space and start collaborating immediately."
            color="bg-sticky-yellow"
          />
          <FeatureCard
            icon={<Users className="w-6 h-6" />}
            title="Real-time"
            description="See changes from everyone instantly. True collaboration, zero lag."
            color="bg-sticky-pink"
          />
          <FeatureCard
            icon={<Globe className="w-6 h-6" />}
            title="Shareable"
            description="Anyone with the link can join. The link IS the room."
            color="bg-sticky-blue"
          />
        </motion.div>

        {/* Footer */}
        <motion.footer
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.8 }}
          className="text-center mt-24 text-sm text-muted-foreground"
        >
          <p>Free forever. No hidden costs.</p>
        </motion.footer>
      </div>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
  color,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  color: string;
}) {
  return (
    <div className="group p-6 bg-card rounded-2xl border border-border hover:border-primary/30 transition-colors">
      <div
        className={`w-12 h-12 ${color} rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}
      >
        {icon}
      </div>
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-muted-foreground text-sm">{description}</p>
    </div>
  );
}
