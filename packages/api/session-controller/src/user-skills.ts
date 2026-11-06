/** User-owned skills under `$DSH_HOME/skills`: list, upload, and remove. */

import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { isSkillName } from '@deepseek-ai/dsh-skill'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import { parse as parseYaml } from 'yaml'
import type {
  UserSkillEntry, UserSkillListValue, UserSkillRemoveRequest, UserSkillUploadRequest,
} from './types.ts'

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** The upload or name is unusable: size, frontmatter, or skill name. */
    'skill/invalid': { readonly name?: string }
    /** A user skill with this name already exists. */
    'skill/exists': { readonly name: string }
    /** No user skill with this name exists. */
    'skill/not-found': { readonly name: string }
  }
}

/** Largest accepted SKILL.md upload, in UTF-8 bytes. */
export const USER_SKILL_MAX_BYTES = 256 * 1024

/**
 * Parse the YAML frontmatter block of a SKILL.md file.
 * @param content - full file text.
 * @returns the trimmed name and description, or undefined when either is missing or the block is not YAML.
 */
function parseFrontmatter(content: string): { name: string; description: string } | undefined {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(content)
  if (match === null) return undefined
  let data: unknown
  try {
    data = parseYaml(match[1] ?? '')
  } catch (_error: unknown) {
    // Malformed YAML is reported to the caller as a missing frontmatter block.
    return undefined
  }
  if (typeof data !== 'object' || data === null || !('name' in data) || !('description' in data)) return undefined
  const { name, description } = data
  if (typeof name !== 'string' || typeof description !== 'string' || description.trim() === '') return undefined
  return { name: name.trim(), description: description.trim() }
}

/**
 * Whether a filesystem path exists, treating only a missing entry as absence.
 * @param path - absolute path to test.
 * @returns true when the path exists.
 */
async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return false
    throw error
  }
}

/**
 * Directory that holds one folder per user skill.
 * @returns `$DSH_HOME/skills`.
 */
function userSkillRoot(): string {
  return join(resolveDshHome(), 'skills')
}

/**
 * List the skill folders under the user skill root.
 * @param signal - caller lifetime for the directory read.
 * @returns skills sorted by name; empty when the root does not exist yet.
 */
export async function listUserSkills(signal: AbortSignal): Promise<UserSkillListValue> {
  signal.throwIfAborted()
  const root = userSkillRoot()
  if (!(await pathExists(root))) return { skills: [] }
  const folders = (await readdir(root, { withFileTypes: true })).filter(entry => entry.isDirectory())
  const skills: UserSkillEntry[] = []
  for (const folder of folders) {
    signal.throwIfAborted()
    const file = join(root, folder.name, 'SKILL.md')
    if (!(await pathExists(file))) continue
    const parsed = parseFrontmatter(await readFile(file, 'utf8'))
    skills.push({
      name: folder.name,
      description: parsed?.description ?? '',
      valid: parsed !== undefined && parsed.name === folder.name && isSkillName(folder.name),
    })
  }
  return { skills: skills.sort((a, b) => a.name.localeCompare(b.name)) }
}

/**
 * Store one uploaded SKILL.md as a new user skill. The file is written into
 * `<name>/SKILL.md`, where the filesystem skill provider discovers it.
 * @param request - the uploaded file text.
 * @param signal - caller lifetime for the write.
 * @returns the stored skill.
 * @throws RemoteError `skill/invalid` for a size, frontmatter, or name violation, and `skill/exists` when the name is taken.
 */
export async function uploadUserSkill(request: UserSkillUploadRequest, signal: AbortSignal): Promise<UserSkillEntry> {
  signal.throwIfAborted()
  if (Buffer.byteLength(request.content, 'utf8') > USER_SKILL_MAX_BYTES) {
    throw new RemoteError('skill/invalid', `skill file is larger than ${USER_SKILL_MAX_BYTES} bytes`, {})
  }
  const parsed = parseFrontmatter(request.content)
  if (parsed === undefined) {
    throw new RemoteError('skill/invalid', 'skill file needs YAML frontmatter with name and description', {})
  }
  if (!isSkillName(parsed.name)) {
    throw new RemoteError(
      'skill/invalid',
      `skill name "${parsed.name}" must use lowercase letters, digits, and single hyphens`,
      {},
    )
  }
  const folder = join(userSkillRoot(), parsed.name)
  if (await pathExists(folder)) {
    throw new RemoteError('skill/exists', `a skill named "${parsed.name}" already exists`, { name: parsed.name })
  }
  await mkdir(folder, { recursive: true })
  await writeFile(join(folder, 'SKILL.md'), request.content, { encoding: 'utf8', flag: 'wx' })
  return { name: parsed.name, description: parsed.description, valid: true }
}

/**
 * Delete one user skill folder. Only folders that contain a SKILL.md under the user root are removed.
 * @param request - the skill name.
 * @param signal - caller lifetime for the removal.
 * @returns nothing once the folder is removed.
 * @throws RemoteError `skill/invalid` for a bad name and `skill/not-found` when no such skill exists.
 */
export async function removeUserSkill(request: UserSkillRemoveRequest, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted()
  if (!isSkillName(request.name)) {
    throw new RemoteError('skill/invalid', `"${request.name}" is not a valid skill name`, {})
  }
  const folder = join(userSkillRoot(), request.name)
  if (!(await pathExists(join(folder, 'SKILL.md')))) {
    throw new RemoteError('skill/not-found', `no user skill named "${request.name}"`, { name: request.name })
  }
  await rm(folder, { recursive: true })
}
