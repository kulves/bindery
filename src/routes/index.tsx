import { createFileRoute } from "@tanstack/react-router";
import { BinderyApp } from "@/components/bindery-app";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <BinderyApp />;
}
