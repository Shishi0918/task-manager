#!/bin/bash
# 自動バックアップスクリプト
cd /Users/shigemorishinji/Programming/claudecode/task

# 変更があるかチェック
if [[ -n $(git status --porcelain) ]]; then
  git add -A
  git commit -m "Auto backup: $(date '+%Y-%m-%d %H:%M')"
  git push origin main
  echo "Backup completed at $(date)"
else
  echo "No changes to backup at $(date)"
fi
