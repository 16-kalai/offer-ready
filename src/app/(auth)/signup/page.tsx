import type { Metadata } from "next";
import { AuthPage } from "../auth-page";

export const metadata: Metadata = { title: "Sign up" };

export default function SignupPage({ searchParams }: PageProps<"/signup">) {
  return <AuthPage mode="signup" searchParams={searchParams} />;
}
