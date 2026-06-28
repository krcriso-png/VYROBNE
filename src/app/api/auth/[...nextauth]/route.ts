import { handlers } from "@/lib/auth";

// Auth.js catch-all route — exposes /api/auth/* (sign-in, callback, etc.).
export const { GET, POST } = handlers;
