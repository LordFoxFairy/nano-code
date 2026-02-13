---
name: security-guidance
description: This skill should be used when the user writes code involving "exec", "eval", "innerHTML", "child_process", "os.system", "pickle", "dangerouslySetInnerHTML", "document.write", GitHub Actions workflows, "security check", "vulnerability", "safe to use", or any security-sensitive operations. Provides security warnings and safe alternatives.
version: 1.0.0
origin: Nano Code skill (security-guidance)
adaptation: PreToolUse hook → skill + HITL (write_file/edit_file require human approval)
---

# Security Guidance

Proactive security reminders for common vulnerability patterns in code.

> **IMPORTANT**: When you detect ANY of the patterns below in code you're about to write,
> you MUST warn the user about the security risk BEFORE writing the code.
> Do NOT write vulnerable code without explicit user acknowledgment.

## Security Patterns to Watch

### 1. Command Injection

**Vulnerable:**
```javascript
const { exec } = require('child_process');
exec(`ls ${userInput}`); // Shell injection risk
```

**Safe:**
```javascript
import { execFile } from 'child_process';
execFile('ls', [userInput]); // No shell interpretation
```

### 2. Code Injection (eval/Function)

**Vulnerable:**
```javascript
eval(userInput);           // Executes arbitrary code
new Function(userCode)();  // Same risk
```

**Safe alternatives:**
- Use `JSON.parse()` for data parsing
- Use template literals for strings
- Use sandboxed interpreter if dynamic code needed

### 3. XSS (Cross-Site Scripting)

**Vulnerable:**
```javascript
element.innerHTML = userContent;
document.write(userContent);
// React
<div dangerouslySetInnerHTML={{__html: userContent}} />
```

**Safe:**
```javascript
element.textContent = userContent; // Plain text
// Or sanitize HTML
import DOMPurify from 'dompurify';
element.innerHTML = DOMPurify.sanitize(userContent);
```

### 4. GitHub Actions Injection

**Vulnerable:**
```yaml
- run: echo "${{ github.event.issue.title }}"
```

**Safe:**
```yaml
- env:
    TITLE: ${{ github.event.issue.title }}
  run: echo "$TITLE"
```

**Risky inputs:** `github.event.issue.title`, `github.event.pull_request.body`, `github.event.comment.body`, `github.head_ref`

### 5. Python Deserialization

**Vulnerable:**
```python
import pickle
data = pickle.loads(user_data)  # Arbitrary code execution!
```

**Safe:**
```python
import json
data = json.loads(user_data)  # Only data, no code
```

### 6. OS Command Execution (Python)

**Vulnerable:**
```python
os.system(f"command {user_input}")  # Shell injection
```

**Safe:**
```python
import subprocess
subprocess.run(['command', user_input], check=True)
```

## Quick Reference

| Pattern | Risk | Mitigation |
|---------|------|------------|
| `exec(cmd)` | Command injection | Use `execFile` with array args |
| `eval(code)` | Code injection | Use `JSON.parse` for data |
| `innerHTML` | XSS | Use `textContent` or sanitize |
| `pickle.loads` | Code execution | Use JSON |
| `os.system` | Shell injection | Use `subprocess.run` with list |
| `${{ input }}` | GHA injection | Use env variables |

---

*Origin: Nano Code `security-guidance` skill*
*Adaptation: PreToolUse hook → skill*
