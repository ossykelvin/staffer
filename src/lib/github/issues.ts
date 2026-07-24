import "server-only";

import { z } from "zod";
import { publicEnv, getGitHubIssueEnv } from "@/lib/env";

const repositoryNameSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/, "Repository must be in owner/name form.");

export const githubIssuePayloadSchema = z
  .object({
    action: z.literal("github.issue_draft"),
    repository: repositoryNameSchema,
    title: z.string().trim().min(1).max(256),
    body: z.string().trim().min(1),
    labels: z.array(z.string().trim().min(1).max(100)).max(20).default([]),
  })
  .passthrough();

export type GitHubIssuePayload = z.infer<typeof githubIssuePayloadSchema>;

export type GitHubIssueExecutionResult = {
  provider: "github";
  mode: "demo" | "live";
  repository: string;
  issueNumber?: number;
  issueUrl?: string;
  issueId?: number;
};

export type GitHubIssueReadinessResult = {
  provider: "github";
  mode: "demo" | "live";
  repository: string;
  tokenConfigured: boolean;
  repositoryReachable: boolean;
  status: "passed" | "failed" | "blocked";
  failureReason?: string;
};

function githubApiUrl(baseUrl: string, path: string) {
  return `${baseUrl.replace(/\/+$/, "")}${path}`;
}

function githubHeaders(token: string, userAgent?: string) {
  return {
    accept: "application/vnd.github+json",
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
    "user-agent": userAgent || "staffer",
    "x-github-api-version": "2022-11-28",
  };
}

function labelColour(label: string) {
  if (label === "feature-intake") {
    return "2563eb";
  }

  if (label === "needs-founder-approval") {
    return "f59e0b";
  }

  return "64748b";
}

async function parseGitHubResponse(response: Response) {
  return (await response.json().catch(() => ({}))) as {
    id?: number;
    number?: number;
    html_url?: string;
    message?: string;
    errors?: Array<{ message?: string; code?: string; field?: string }>;
  };
}

async function ensureLabels(input: { apiBaseUrl: string; token: string; userAgent?: string; repository: string; labels: string[] }) {
  if (!input.labels.length) {
    return;
  }

  const [owner, repo] = input.repository.split("/");

  await Promise.all(
    input.labels.map(async (label) => {
      const response = await fetch(githubApiUrl(input.apiBaseUrl, `/repos/${owner}/${repo}/labels`), {
        method: "POST",
        headers: githubHeaders(input.token, input.userAgent),
        body: JSON.stringify({
          name: label,
          color: labelColour(label),
          description: label === "feature-intake" ? "Created from Staffer Feature Intake." : "Requires founder approval before execution.",
        }),
      });

      if (response.ok || response.status === 422) {
        return;
      }

      const payload = await parseGitHubResponse(response);
      throw new Error(payload.message || `GitHub label setup failed with status ${response.status}.`);
    }),
  );
}

export async function createApprovedGitHubIssue(input: unknown): Promise<GitHubIssueExecutionResult> {
  const payload = githubIssuePayloadSchema.parse(input);

  if (publicEnv.NEXT_PUBLIC_DEMO_MODE === "true") {
    return {
      provider: "github",
      mode: "demo",
      repository: payload.repository,
      issueNumber: 0,
      issueUrl: `demo://${payload.repository}/issues/0`,
    };
  }

  const env = getGitHubIssueEnv();
  if (!env.GITHUB_API_BASE_URL) {
    throw new Error("GITHUB_API_BASE_URL is required before approved GitHub issue creation can run.");
  }

  if (!env.GITHUB_ISSUE_TOKEN) {
    throw new Error("GITHUB_ISSUE_TOKEN is required before approved GitHub issue creation can run.");
  }

  await ensureLabels({
    apiBaseUrl: env.GITHUB_API_BASE_URL,
    token: env.GITHUB_ISSUE_TOKEN,
    userAgent: env.GITHUB_ISSUE_USER_AGENT,
    repository: payload.repository,
    labels: payload.labels,
  });

  const [owner, repo] = payload.repository.split("/");
  const response = await fetch(githubApiUrl(env.GITHUB_API_BASE_URL, `/repos/${owner}/${repo}/issues`), {
    method: "POST",
    headers: githubHeaders(env.GITHUB_ISSUE_TOKEN, env.GITHUB_ISSUE_USER_AGENT),
    body: JSON.stringify({
      title: payload.title,
      body: payload.body,
      labels: payload.labels,
    }),
  });

  const result = await parseGitHubResponse(response);
  if (!response.ok) {
    const detail = result.errors?.map((error) => error.message || error.code || error.field).filter(Boolean).join("; ");
    throw new Error(result.message || detail || `GitHub issue creation failed with status ${response.status}.`);
  }

  return {
    provider: "github",
    mode: "live",
    repository: payload.repository,
    issueNumber: result.number,
    issueUrl: result.html_url,
    issueId: result.id,
  };
}

export function getGitHubIssueConfigurationStatus() {
  return {
    apiBaseUrlConfigured: Boolean(process.env.GITHUB_API_BASE_URL),
    tokenConfigured: Boolean(process.env.GITHUB_ISSUE_TOKEN),
  };
}

export async function verifyGitHubIssueRepositoryReadiness(repository: string): Promise<GitHubIssueReadinessResult> {
  const parsedRepository = repositoryNameSchema.parse(repository);

  if (publicEnv.NEXT_PUBLIC_DEMO_MODE === "true") {
    return {
      provider: "github",
      mode: "demo",
      repository: parsedRepository,
      tokenConfigured: true,
      repositoryReachable: true,
      status: "passed",
    };
  }

  const env = getGitHubIssueEnv();
  const tokenConfigured = Boolean(env.GITHUB_ISSUE_TOKEN);
  if (!env.GITHUB_API_BASE_URL || !tokenConfigured) {
    return {
      provider: "github",
      mode: "live",
      repository: parsedRepository,
      tokenConfigured,
      repositoryReachable: false,
      status: "blocked",
      failureReason: !env.GITHUB_API_BASE_URL ? "GITHUB_API_BASE_URL is not configured." : "GITHUB_ISSUE_TOKEN is not configured.",
    };
  }

  const apiBaseUrl = env.GITHUB_API_BASE_URL;
  const token = env.GITHUB_ISSUE_TOKEN;
  if (!apiBaseUrl || !token) {
    throw new Error("GitHub readiness configuration changed during verification.");
  }

  const [owner, repo] = parsedRepository.split("/");
  const response = await fetch(githubApiUrl(apiBaseUrl, `/repos/${owner}/${repo}`), {
    method: "GET",
    headers: githubHeaders(token, env.GITHUB_ISSUE_USER_AGENT),
  });
  const payload = await parseGitHubResponse(response);

  return {
    provider: "github",
    mode: "live",
    repository: parsedRepository,
    tokenConfigured,
    repositoryReachable: response.ok,
    status: response.ok ? "passed" : "failed",
    failureReason: response.ok ? undefined : payload.message || `GitHub repository check failed with status ${response.status}.`,
  };
}
