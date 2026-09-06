/**
 * Netlify scheduled function: starts the GitHub Actions refresh workflow every
 * 15 minutes, because GitHub's own cron fired only twice on 6 Sep 2026.
 * Needs GITHUB_DISPATCH_TOKEN (a fine-grained token with Actions read/write on
 * the repository) in the site's environment; without it the function only logs.
 */
const REPO = "rezzzq/abu-gunung-api";
const WORKFLOW = "update-and-deploy.yml";

export default async (): Promise<Response> => {
  const token = Netlify.env.get("GITHUB_DISPATCH_TOKEN");
  if (!token) {
    console.log("trigger-refresh: GITHUB_DISPATCH_TOKEN is not set; nothing to do");
    return new Response("no token", { status: 200 });
  }
  const res = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "abu-gunung-api-trigger",
    },
    body: JSON.stringify({ ref: "main" }),
  });
  const detail = res.status === 204 ? "dispatched" : `HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`;
  console.log(`trigger-refresh: ${detail}`);
  return new Response(detail, { status: res.status === 204 ? 200 : 502 });
};

export const config = {
  // Off the quarter-hour, like the GitHub cron, so the two never collide.
  schedule: "9,24,39,54 * * * *",
};
