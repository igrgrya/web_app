# Git workflow

- Work happens on the `dev` branch. Commit after each completed, logical change (a finished feature, fix, or refactor) with a clear, conventional commit message — do not batch unrelated changes into one commit.
- After committing, push `dev` to `origin` automatically, without asking for confirmation first.
- Never commit or push directly to `main` or `master`. Changes reach `main` only via a pull request from `dev`, opened when the user asks for one — never opened automatically.
- Never force-push, rewrite history (`rebase`, `amend` on pushed commits), or delete branches without explicit user request.
- If a commit would include a file that looks like it might hold secrets or credentials, stop and check with the user before committing, even though push itself is pre-authorized.
