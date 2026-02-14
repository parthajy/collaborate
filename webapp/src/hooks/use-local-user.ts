import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "collaborate-user";

interface LocalUser {
  name: string;
  color: string;
}

const COLORS = [
  "#EF4444", "#F59E0B", "#10B981", "#3B82F6",
  "#8B5CF6", "#EC4899", "#06B6D4", "#84CC16"
];

function getRandomColor() {
  return COLORS[Math.floor(Math.random() * COLORS.length)];
}

function generateGuestName() {
  return `Guest ${Math.floor(Math.random() * 1000)}`;
}

export function useLocalUser() {
  const [user, setUser] = useState<LocalUser>(() => {
    if (typeof window === "undefined") {
      return { name: generateGuestName(), color: getRandomColor() };
    }
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch {
        // Invalid JSON, generate new user
      }
    }
    return { name: generateGuestName(), color: getRandomColor() };
  });

  // Save to localStorage whenever user changes
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  }, [user]);

  const setName = useCallback((name: string) => {
    setUser((prev) => ({ ...prev, name: name.trim() || generateGuestName() }));
  }, []);

  const setColor = useCallback((color: string) => {
    setUser((prev) => ({ ...prev, color }));
  }, []);

  return {
    name: user.name,
    color: user.color,
    setName,
    setColor,
    colors: COLORS,
  };
}
