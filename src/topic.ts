// Topic CRUD + active-topic selection. A topic is the agnostic container: its
// topic.json holds all domain config, so plugging in a new subject is data-only.
import { readdir } from "node:fs/promises";
import { topicConfigFile, topicsDir, userFile } from "./paths.ts";
import type { TopicConfig } from "./types.ts";

interface UserState {
  activeTopic?: string;
  [k: string]: unknown;
}

export async function createTopic(config: TopicConfig): Promise<void> {
  await Bun.write(topicConfigFile(config.id), `${JSON.stringify(config, null, 2)}\n`);
}

export async function readTopicConfig(topicId: string): Promise<TopicConfig | null> {
  const f = Bun.file(topicConfigFile(topicId));
  if (!(await f.exists())) return null;
  return (await f.json()) as TopicConfig;
}

export async function updateTopicConfig(
  topicId: string,
  patch: Partial<TopicConfig>,
): Promise<TopicConfig> {
  const current = await readTopicConfig(topicId);
  if (!current) throw new Error(`topic not found: ${topicId}`);
  const next: TopicConfig = { ...current, ...patch, meta: { ...current.meta, ...patch.meta } };
  await createTopic(next);
  return next;
}

export async function listTopics(): Promise<string[]> {
  try {
    const entries = await readdir(topicsDir(), { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

async function readUserState(): Promise<UserState> {
  const f = Bun.file(userFile());
  if (!(await f.exists())) return {};
  return (await f.json()) as UserState;
}

export async function setActiveTopic(topicId: string): Promise<void> {
  const state = await readUserState();
  state.activeTopic = topicId;
  await Bun.write(userFile(), `${JSON.stringify(state, null, 2)}\n`);
}

export async function getActiveTopic(): Promise<string | null> {
  const state = await readUserState();
  return state.activeTopic ?? null;
}
