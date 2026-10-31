import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";

/** Better Auth endpoints: Google redirect and callback, session, sign-out. */
const handler = () => toNextJsHandler(auth());

export const GET = (request: Request) => handler().GET(request);
export const POST = (request: Request) => handler().POST(request);
