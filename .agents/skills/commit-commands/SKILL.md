---
name: commit-commands
description: This skill should be used when the user asks to "commit", "git commit", "push changes", "create pr", "create pull request", "open a pr", "/commit", "push and create PR", "/commit-push-pr", "clean branches", "clean up gone branches", or mentions git workflow operations.
version: 1.0.0
---

# Commit Commands

Streamline git workflow with simple commands for committing, pushing, and creating pull requests.

## Available Commands

### /commit
Creates a git commit with an automatically generated commit message.

**What it does:**
1. Analyzes current git status
2. Reviews staged and unstaged changes
3. Examines recent commit messages to match style
4. Drafts appropriate commit message
5. Stages relevant files
6. Creates the commit

**Best practices:**
- Automatically drafts messages matching repo style
- Follows conventional commit practices
- Avoids committing secrets (.env, credentials)
- Includes attribution in commit message

### /commit-push-pr
Complete workflow: commit, push, and create pull request.

**What it does:**
1. Creates new branch (if on main)
2. Stages and commits changes
3. Pushes branch to origin
4. Creates PR with summary and test plan
5. Provides PR URL

**PR description includes:**
- Summary (1-3 bullet points)
- Test plan checklist
- Attribution

### /clean_gone
Cleans up local branches deleted from remote.

**What it does:**
1. Lists branches with [gone] status
2. Removes associated worktrees
3. Deletes stale branches
4. Reports cleanup results

## Command Definitions

See `commands/` directory for detailed command specifications:
- `commands/commit.md`
- `commands/commit-push-pr.md`
- `commands/clean_gone.md`

## Requirements

- Git installed and configured
- GitHub CLI (`gh`) for PR creation
- Repository with remote
