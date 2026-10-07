import type { Metadata } from "next";
import { LaunchForm } from "@/components/LaunchForm";

export const metadata: Metadata = { title: "Launch a token" };

export default function LaunchPage() {
  return <LaunchForm />;
}
